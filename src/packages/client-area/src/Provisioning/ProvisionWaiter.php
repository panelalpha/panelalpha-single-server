<?php

namespace PanelAlpha\ClientArea\Provisioning;

use Illuminate\Support\Sleep;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;

/**
 * Files-source onboarding keeps the old panel's synchronous create: the domain
 * step waits until the Engine really made the project and mirrors it before
 * answering (old `User\DomainController::create` files branch,
 * packages/api/app/Http/Controllers/User/DomainController.php:108-140 – the old
 * `connect()->createUser()` returned the finished account in the response).
 *
 * The Engine's `POST /projects` is async (`202 + Task`, `ProjectCreator::queue`),
 * so the panel polls `GET tasks/{id}?after_id=` and then fetches the finished
 * project (`GET projects/{u}`) exactly like WatchApplicationTaskJob follows a
 * task.
 *
 * Outcomes:
 *  - a definite Engine failure (task failed/cancelled, or an error other than a
 *    connect/timeout or 5xx) and an exhausted budget answer **422 keyed
 *    `domain`** with the Engine message (or the "still being created" text);
 *    never 502/503/504, which the CA treats as a lost response and recovers by
 *    adopting the half-created project (`OnboardingModalWrapper.vue:635-650`);
 *  - Engine hiccups (connection error, 5xx) are retried inside the budget;
 *  - the create task's `completed` status is what proves the project exists: the
 *    row is marked `onboarding_files_at` **before** the mirror read, and a
 *    `show` hiccup is retried inside the budget, so a failed mirror read can
 *    never leave the row unmarked (the CA would adopt it as a lost response and
 *    every upload/deploy would then answer "not in files onboarding");
 *  - a create answer without a task id is not "finished": it answers 422 keyed
 *    `domain` rather than marking the row;
 *  - the budget is measured from the request start (`$startedAt`), so the
 *    surrounding project create and its retry-without-`name` count against it;
 *  - polls use `Sleep` (faked in tests) at a pinned 3 s and carry the Task's
 *    `next_after_id`.
 *
 * On completion the step marks the row `onboarding_files_at` which the onboarding
 * upload/deploy require; the wait is bounded by
 * EngineClient::LONG_TIMEOUT_SECONDS so it stays below the route's nginx/php-fpm
 * headroom. The controller maps a create-call connection
 * error or 5xx to the same 422 keyed `domain` before this waiter is reached.
 */
final class ProvisionWaiter
{
    /** Seconds between polls while the create task runs. */
    public const POLL_SECONDS = 3;

    /**
     * The budget text the CA shows when the create is still running
     *The en-dash is deliberate.
     */
    public const STILL_CREATING = 'The project is still being created – try again in a minute.';

    /**
     * A create answer with no task id cannot be followed and does not prove the
     * project exists.
     */
    public const NO_TASK = 'The Engine did not return a task for the project creation.';

    public function __construct(private readonly ApplicationSynchronizer $synchronizer) {}

    /**
     * Wait for the create task, then mirror the finished project and mark it in
     * files onboarding. Returns the refreshed application (the `pending` row
     * updated with the Engine's real domain, status and payload).
     *
     * @param  int|null  $startedAt  unix time the request started, so the budget
     *                               covers the project create and its retry
     *
     * @throws ValidationException a failed/cancelled task or an exhausted budget
     */
    public function wait(Application $application, ?int $taskId, ?int $startedAt = null): Application
    {
        $deadline = ($startedAt ?? now()->getTimestamp()) + EngineClient::LONG_TIMEOUT_SECONDS;

        return $this->follow($application, $taskId, $deadline, true);
    }

    /**
     * Wait for the create task and mirror the finished project, without
     * marking the row in files onboarding. For a caller that only needs the
     * project to exist, such as a Git connect that met a busy 409 on a project
     * the wizard just created.
     *
     * @param  int  $deadline  unix time the wait must end by; the caller derives
     *                         it from its request start and
     *                         EngineClient::LONG_TIMEOUT_SECONDS
     *
     * @throws ValidationException a failed/cancelled task or an exhausted budget
     */
    public function waitForTask(Application $application, ?int $taskId, int $deadline): Application
    {
        return $this->follow($application, $taskId, $deadline, false);
    }

    /**
     * @throws ValidationException a failed/cancelled task or an exhausted budget
     */
    private function follow(Application $application, ?int $taskId, int $deadline, bool $stampOnboarding): Application
    {
        if ($taskId === null || $taskId <= 0) {
            // No task to follow; a create answer without an id is not proof the
            // project exists. Marking it here would let the CA
            // adopt a half-created project on a lost response.
            throw ValidationException::withMessages(['domain' => [self::NO_TASK]]);
        }

        $afterId = 0;

        while (true) {
            /** @var array<string, mixed> $task */
            $task = [];
            try {
                $task = $application->engine()->task($taskId, $afterId);
            } catch (EngineUnavailableException) {
                // A poll hiccup is not a failure: retry inside the budget.
                $this->guardBudget($deadline);
                Sleep::sleep(self::POLL_SECONDS);

                continue;
            } catch (EngineValidationException $e) {
                // The Engine rejected the poll itself; that is definite.
                throw ValidationException::withMessages(['domain' => [EngineErrors::message($e)]]);
            } catch (EngineRequestException $e) {
                if ($e->engineStatus >= 500) {
                    $this->guardBudget($deadline);
                    Sleep::sleep(self::POLL_SECONDS);

                    continue;
                }

                throw ValidationException::withMessages(['domain' => [EngineErrors::message($e)]]);
            }

            $status = Payload::string($task['status'] ?? '');
            $afterId = Payload::int($task['next_after_id'] ?? $afterId) ?? $afterId;

            if ($status === 'completed') {
                // Mark before the mirror read: the create task is what proves the
                // project exists, and a failed `show` must not leave the row out
                // of files onboarding.
                if ($stampOnboarding) {
                    $application = $this->markOnboarding($application);
                }

                return $this->mirrorWithRetries($application, $deadline);
            }

            if (in_array($status, ['failed', 'cancelled'], true)) {
                throw ValidationException::withMessages(['domain' => [$this->taskError($task)]]);
            }

            $this->guardBudget($deadline);
            Sleep::sleep(self::POLL_SECONDS);
        }
    }

    /**
     * Mirror the finished project. The onboarding marker is already set, so a
     * connection error or 5xx here only delays the answer: it is retried inside
     * the budget; a definite Engine failure answers 422 keyed `domain`.
     */
    private function mirrorWithRetries(Application $application, int $deadline): Application
    {
        while (true) {
            try {
                return $this->mirrorFinished($application);
            } catch (EngineUnavailableException) {
                $this->guardBudget($deadline);
                Sleep::sleep(self::POLL_SECONDS);
            } catch (EngineValidationException $e) {
                throw ValidationException::withMessages(['domain' => [EngineErrors::message($e)]]);
            } catch (EngineRequestException $e) {
                if ($e->engineStatus >= 500) {
                    $this->guardBudget($deadline);
                    Sleep::sleep(self::POLL_SECONDS);

                    continue;
                }

                throw ValidationException::withMessages(['domain' => [EngineErrors::message($e)]]);
            }
        }
    }

    /**
     * The finished project as the Engine sees it (a project created for the
     * files source is a DinD project; its `details` carry the template the
     * container gates read).
     */
    private function mirrorFinished(Application $application): Application
    {
        $project = (new ProjectsApi($application->engine()))->show($application->engineProject());

        return $this->synchronizer->mirror($application->engine_id, $project) ?? $application;
    }

    /**
     * The row is now in files onboarding until the first accepted deploy
     *Set once; a re-entered wait keeps the first time.
     */
    private function markOnboarding(Application $application): Application
    {
        if ($application->onboarding_files_at === null) {
            $application->forceFill(['onboarding_files_at' => now()])->save();
        }

        return $application;
    }

    /**
     * @throws ValidationException when the wall-clock budget is used up
     */
    private function guardBudget(int $deadline): void
    {
        if (now()->getTimestamp() >= $deadline) {
            throw ValidationException::withMessages(['domain' => [self::STILL_CREATING]]);
        }
    }

    /**
     * The Engine message of a failed task (`TaskResource` → `details.error` /
     * `details.problems[]`, the shape WatchApplicationTaskJob reads).
     *
     * @param  array<string, mixed>  $task
     */
    private function taskError(array $task): string
    {
        $details = Payload::object($task['details'] ?? null);

        $error = Payload::nullableString($details['error'] ?? null);
        if ($error !== null && $error !== '') {
            return $error;
        }

        foreach (Payload::objects($details['problems'] ?? null) as $problem) {
            $message = Payload::nullableString($problem['message'] ?? null);
            if ($message !== null && $message !== '') {
                return $message;
            }
        }

        return 'The Engine could not create the project.';
    }
}
