<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The plain attacher of the `GitSourceAttacher` seam: attach the git
 * source to an eligible project with the Engine's plain
 * `POST /projects/{u}/source`. A definite `project_not_eligible` is the
 * old-style 422 with a user-safe message; a `source_already_attached` answers
 * the accepted state; any other Engine refusal –
 * including the busy 409 while the domain-step project still prepares –
 * bubbles. Waiting out that busy 409 in the background is the classic-project replacement
 * {@see ClassicOnboardingGitAttacher} layers on top of this attacher (see
 * {@see self::isBusy()}); that one is the seam's default, and this class is the
 * controller default no more.
 *
 * The caller ({@see OnboardingDeployService}) follows the accepted install;
 * this class only owns the Engine attach.
 */
final class EngineGitSourceAttacher implements GitSourceAttacher
{
    /**
     * The old-style 422 when a classic project (or one that already runs an
     * application) cannot take a git source. The Engine's own text instructs the
     * API caller ("Create the project with `template: dind`"), which the CA must
     * never show.
     */
    public const CLASSIC_REFUSAL = 'This project cannot be deployed from git. Create a new project instead.';

    public function attach(Application $application, array $source, string $finishedType, string $failedType): GitSourceAttachResult
    {
        $taskId = null;

        try {
            $taskId = (new ProjectsApi($application->engine()))->attachSource($application->engineProject(), $source);
        } catch (EngineRequestException $e) {
            // A classic project or one that already runs an application: the
            // old-style 422 with a user-safe message, never the Engine's caller
            // instruction.
            if (self::hasProblemCode($e, 'project_not_eligible')) {
                throw ValidationException::withMessages(['git_repo' => [self::CLASSIC_REFUSAL]]);
            }

            // The project already has the git source: a repeated
            // `POST /projects/deploy` answers the accepted state, so it never
            // writes a failed row or sends a notification.
            if (self::hasProblemCode($e, 'source_already_attached')) {
                return GitSourceAttachResult::handled();
            }

            throw $e;
        }

        return GitSourceAttachResult::accepted($taskId);
    }

    /**
     * The plain `POST source` default keeps no onboarding state: the domain
     * step's classic-onboarding marker is the classic-replacement workaround's.
     */
    public function domainStepCreated(Application $application, ?string $sourceType): void
    {
        // Nothing to record: the classic-project replacement keeps the marker.
    }

    /**
     * Whether the Engine refused the attach only because the domain-step
     * project is still preparing (a 409 without a definite refusal code), so a
     * background retry can still succeed.
     */
    public static function isBusy(EngineRequestException $e): bool
    {
        return $e->engineStatus === 409 && ! self::isDefiniteAttachConflict($e);
    }

    /**
     * Whether the Engine refusal carries a stable `problems[].code`
     * (`core/app/Exceptions/ProblemException.php:38`, rendered by the Engine
     * handler beside `errors`).
     */
    private static function hasProblemCode(EngineRequestException $e, string $code): bool
    {
        foreach (Payload::objects($e->response?->json('problems')) as $problem) {
            if (Payload::nullableString($problem['code'] ?? null) === $code) {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether the Engine's 409 is a definite refusal of the git source
     * (`SourceAttacher::assertEligible`, core/app/Lib/Project/SourceAttacher.php:82-99)
     * rather than the project still preparing (`ProjectRebuild::whileIdle`). The
     * definite refusals carry a `problems[].code`; the busy ones do not
     * (`core/app/Exceptions/DeployBusyException.php`).
     */
    private static function isDefiniteAttachConflict(EngineRequestException $e): bool
    {
        return self::hasProblemCode($e, 'source_already_attached')
            || self::hasProblemCode($e, 'project_not_eligible');
    }
}
