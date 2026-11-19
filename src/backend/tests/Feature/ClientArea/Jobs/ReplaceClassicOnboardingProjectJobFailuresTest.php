<?php

namespace Tests\Feature\ClientArea\Jobs;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Jobs\Application\ReplaceClassicOnboardingProjectJob;
use PanelAlpha\ClientArea\Jobs\Application\WatchDeployJob;
use PanelAlpha\ClientArea\Models\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The ways replacing the untouched classic onboarding project can go wrong:
 * the project is gone, the Engine refuses the delete or the create, the
 * Engine hiccups, the project has no owner, or the Engine answers with
 * another username than the one asked for.
 *
 * Contract: a refusal ends the CA spinner with `installation_failed` and clears
 * the `replacing_at` marker; only a hiccup (connection error, 5xx) is retried
 * with a backoff (3, 6, 12 ... seconds).
 */
class ReplaceClassicOnboardingProjectJobFailuresTest extends TestCase
{
    use JobFixtures, RefreshDatabase;

    private const FINISHED = 'user.instance.installation_finished';

    private const FAILED = 'user.instance.installation_failed';

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        Event::fake([ClientAreaNotificationRequested::class]);
    }

    private function application(): Application
    {
        User::factory()->create();

        return $this->bareApplication(['domain' => 'shop.example.com', 'engine_username' => 'shop', 'onboarding_at' => now()]);
    }

    private function runJob(Application $application, int $hiccupAttempt = 0): void
    {
        Queue::fake();
        (new ReplaceClassicOnboardingProjectJob(
            $application->id,
            ['git_repo' => 'https://github.com/example/site.git', 'git_branch' => 'main', 'git_token' => null, 'env_vars' => []],
            self::FINISHED,
            self::FAILED,
            startedAt: now()->getTimestamp(),
            hiccupAttempt: $hiccupAttempt,
        ))->handle(app(ApplicationProvisioner::class), app(AccessResolver::class));
    }

    private function assertFailedAndReleased(Application $application, string $message): void
    {
        $this->assertNotified(self::FAILED, true, $message);
        $this->assertNull($application->fresh()->replacing_at, 'the swap is over, the sync may reconcile the row');
        Queue::assertNothingPushed();
    }

    public function test_a_deleted_project_ends_the_replace_quietly(): void
    {
        $application = $this->application();
        $id = $application->id;
        $application->delete();
        Http::fake();

        Queue::fake();
        (new ReplaceClassicOnboardingProjectJob($id, [], self::FINISHED, self::FAILED))
            ->handle(app(ApplicationProvisioner::class), app(AccessResolver::class));

        Http::assertNothingSent();
        $this->assertNotNotified();
    }

    public function test_the_failed_hook_of_a_deleted_project_notifies_nobody(): void
    {
        $application = $this->application();
        $id = $application->id;
        $application->delete();

        (new ReplaceClassicOnboardingProjectJob($id, [], self::FINISHED, self::FAILED))->failed();

        $this->assertNotNotified();
    }

    public function test_the_failed_hook_releases_the_row_and_ends_the_spinner(): void
    {
        $application = $this->application();
        $application->forceFill(['replacing_at' => now()])->save();

        (new ReplaceClassicOnboardingProjectJob($application->id, [], self::FINISHED, self::FAILED))->failed();

        $this->assertNull($application->fresh()->replacing_at);
        $this->assertNotified(self::FAILED, true, 'The project could not be replaced.');
    }

    public function test_a_delete_5xx_polls_again_with_a_backoff(): void
    {
        $application = $this->application();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy (the Engine errors)
        Http::fake(['engine.example.com/api/projects/shop' => Http::response(['message' => 'boom'], 500)]);

        $this->runJob($application);

        $this->assertPollQueued(ReplaceClassicOnboardingProjectJob::class, 1, 3);
        $this->assertNotNotified();
    }

    public function test_an_unreachable_engine_at_the_delete_polls_again_with_a_backoff(): void
    {
        $application = $this->application();
        Http::fake(['engine.example.com/api/projects/shop' => Http::failedConnection()]);

        $this->runJob($application, hiccupAttempt: 2);

        $this->assertPollQueued(ReplaceClassicOnboardingProjectJob::class, 3, 12);
        $this->assertNotNotified();
    }

    public function test_a_delete_refusal_fails_the_replace_with_the_engine_message(): void
    {
        $application = $this->application();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy (a refusal that is not 404, 409 or 5xx)
        Http::fake(['engine.example.com/api/projects/shop' => Http::response(['message' => 'This token may not delete projects.'], 403)]);

        $this->runJob($application);

        $this->assertFailedAndReleased($application, 'This token may not delete projects.');
    }

    public function test_a_delete_validation_error_fails_the_replace(): void
    {
        $application = $this->application();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy (a 422)
        Http::fake(['engine.example.com/api/projects/shop' => Http::response(['message' => 'Invalid.', 'errors' => ['project' => ['The project cannot be deleted.']]], 422)]);

        $this->runJob($application);

        $this->assertFailedAndReleased($application, 'The project cannot be deleted.');
    }

    public function test_a_project_without_an_owner_fails_the_replace_after_the_delete(): void
    {
        $application = $this->bareApplication(['domain' => 'shop.example.com', 'engine_username' => 'shop']);
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/shop' => Http::response(['data' => ['id' => 55, 'username' => 'shop']])]);

        $this->runJob($application);

        $this->assertFailedAndReleased($application, 'The project could not be replaced.');
        Http::assertNotSent(fn ($request): bool => $request->method() === 'POST');
    }

    /**
     * @return array<string, array{0: int, 1: array<string, mixed>, 2: string}>
     */
    public static function createRefusals(): array
    {
        return [
            'validation error' => [422, ['message' => 'Invalid.', 'errors' => ['domain' => ['The domain is in use.']]], 'The domain is in use.'],
            'forbidden' => [403, ['message' => 'This token may not create projects.'], 'This token may not create projects.'],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    #[DataProvider('createRefusals')]
    public function test_a_create_refusal_fails_the_replace_with_the_engine_message(int $status, array $body, string $message): void
    {
        $application = $this->application();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy (the classic project is still there)
        // Engine: core/app/Http/Controllers/UserController.php:300 -> UserController::storeAsync (refuses)
        Http::fake([
            'engine.example.com/api/projects/shop' => Http::response(['data' => ['id' => 55, 'username' => 'shop']]),
            'engine.example.com/api/projects' => Http::response($body, $status),
        ]);

        $this->runJob($application);

        $this->assertFailedAndReleased($application, $message);
    }

    public function test_an_unreachable_engine_at_the_create_polls_again_with_a_backoff(): void
    {
        $application = $this->application();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy (the classic project is still there)
        Http::fake([
            'engine.example.com/api/projects/shop' => Http::response(['data' => ['id' => 55, 'username' => 'shop']]),
            'engine.example.com/api/projects' => Http::failedConnection(),
        ]);

        $this->runJob($application);

        $this->assertPollQueued(ReplaceClassicOnboardingProjectJob::class, 1, 3);
        $this->assertNotNotified();
    }

    public function test_an_engine_that_picks_another_username_moves_its_binding_onto_the_ci_row(): void
    {
        $application = $this->application();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy (the classic project is still there)
        // Engine: core/app/Http/Controllers/UserController.php:300 -> UserController::storeAsync (answers a username of its own)
        Http::fake([
            'engine.example.com/api/projects/shop' => Http::response(['data' => ['id' => 55, 'username' => 'shop']]),
            'engine.example.com/api/projects' => Http::response(['data' => [
                'id' => 61,
                'username' => 'shop2',
                'details' => ['username' => 'shop2', 'domain' => 'shop.example.com'],
            ]], 202),
        ]);

        $this->runJob($application);

        $row = Application::query()->sole();
        $this->assertSame($application->id, $row->id, 'the CA keeps the row it already holds');
        $this->assertSame('shop2', $row->engine_username);
        $this->assertNull($row->onboarding_at);
        $this->assertNull($row->replacing_at);
        Queue::assertPushed(WatchDeployJob::class, fn (WatchDeployJob $job): bool => $job->applicationId === $application->id && $job->taskId === 61);
    }
}
