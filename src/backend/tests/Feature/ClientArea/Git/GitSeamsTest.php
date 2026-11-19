<?php

namespace Tests\Feature\ClientArea\Git;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\GitOperation;
use PanelAlpha\ClientArea\Projects\GitAutoDeployHooks;
use PanelAlpha\ClientArea\Projects\GitAutoDeployService;
use PanelAlpha\ClientArea\Projects\GitOperationLog;
use PanelAlpha\ClientArea\Projects\GitOperationRecorder;
use PanelAlpha\ClientArea\Projects\GitService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The git operation log and the auto-deploy/provider webhook are controller
 * contracts with inert defaults, and {@see GitService} reaches `git_operations`
 * and the git provider only through those seams. The `git_operations` log is
 * the controller's default and the pass-through default is gone; the
 * auto-deploy hooks are the default too and the disabled default is gone, so
 * neither seam is a legacy seam any more.
 *
 * @see src/Projects/GitOperationRecorder.php
 * @see src/Projects/GitAutoDeployHooks.php
 */
class GitSeamsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_the_git_seam_contracts_are_the_extracted_seams(): void
    {
        $this->assertTrue(interface_exists(GitOperationRecorder::class));
        $operations = new \ReflectionClass(GitOperationRecorder::class);
        $this->assertStringNotContainsString('@legacy-seam', (string) $operations->getDocComment());
        $this->assertSame(
            ['record', 'recordClone', 'recordWebhookPull'],
            $this->sortedMethods($operations),
        );

        $this->assertTrue(interface_exists(GitAutoDeployHooks::class));
        $hooks = new \ReflectionClass(GitAutoDeployHooks::class);
        $this->assertStringNotContainsString('@legacy-seam', (string) $hooks->getDocComment());
        $this->assertSame(
            // `importDeliveries` left with the delivery import.
            ['deleteProviderWebhook', 'disable', 'enable', 'rotate'],
            $this->sortedMethods($hooks),
        );
    }

    public function test_the_container_binds_the_git_log_and_auto_deploy_hooks_by_default(): void
    {
        $this->assertInstanceOf(GitOperationLog::class, app(GitOperationRecorder::class));
        $this->assertInstanceOf(GitAutoDeployService::class, app(GitAutoDeployHooks::class));
    }

    /**
     * The pass-through default (no panel table) left with the
     * move of the `git_operations` log into the controller.
     */
    public function test_the_pass_through_recorder_is_gone(): void
    {
        $this->assertFalse(class_exists('PanelAlpha\\ClientArea\\Projects\\PassThroughGitOperationRecorder'));
    }

    /**
     * The disabled default (auto-deploy refused) left with the
     * move of the auto-deploy hooks into the controller.
     */
    public function test_the_disabled_auto_deploy_hooks_are_gone(): void
    {
        $this->assertFalse(class_exists('PanelAlpha\\ClientArea\\Projects\\DisabledGitAutoDeployHooks'));
    }

    public function test_the_git_operation_log_records_operations(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // Engine: core/app/Http/Controllers/User/GitController.php:141 -> GitController::commits
        Http::fake(['engine.example.com/api/projects/site1/git/commits*' => Http::response(['data' => []])]);
        $log = new GitOperationLog;

        $result = $log->record(
            $application,
            GitOperation::ACTION_PUSH,
            fn (): array => ['nothing_to_push' => true],
            static fn (): string => GitOperation::STATUS_SKIPPED,
            GitService::PUSH_NOTHING_MESSAGE,
        );
        $this->assertSame(['nothing_to_push' => true], $result);
        $this->assertDatabaseHas('git_operations', [
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_PUSH,
            'status' => GitOperation::STATUS_SKIPPED,
            'error_message' => GitService::PUSH_NOTHING_MESSAGE,
        ]);

        $log->recordClone($application);
        $this->assertDatabaseHas('git_operations', [
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_CLONE,
            'status' => GitOperation::STATUS_SUCCESS,
        ]);

        $log->recordWebhookPull(
            $application,
            ['commit' => 'abcdef', 'outcome' => 'deployed'],
            Carbon::parse('2026-03-20T09:28:21+00:00'),
            true,
            'deployed',
        );
        $this->assertDatabaseHas('git_operations', [
            'application_id' => $application->id,
            'action' => GitOperation::ACTION_WEBHOOK_PULL,
            'commit_hash' => 'abcdef',
            'status' => GitOperation::STATUS_SUCCESS,
        ]);
    }

    public function test_the_git_service_records_through_the_seam(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status (the pull reads the tree it asks about)
        Http::fake(['engine.example.com/api/projects/site1/git/status' => Http::response(['data' => [
            'connected' => true, 'branch' => 'main', 'repository_exists' => true, 'dirty' => false,
        ]])]);

        $recorder = new W2RecordingGitOperationRecorder;
        $this->app->instance(GitOperationRecorder::class, $recorder);

        app(GitService::class)->pull($application, []);

        // The seam answered without running the Engine closure.
        $this->assertContains('record', $recorder->calls);
        Http::assertNotSent(fn ($request): bool => str_ends_with($request->url(), '/git/pull'));
    }

    public function test_the_git_service_delegates_auto_deploy_to_the_seam(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:86 -> GitController::status
        Http::fake(['engine.example.com/api/projects/site1/git/status' => Http::response(['data' => ['connected' => false]])]);

        $hooks = new W2RecordingGitAutoDeployHooks;
        $this->app->instance(GitAutoDeployHooks::class, $hooks);

        $git = app(GitService::class);
        $git->toggleAutoDeploy($application, true);
        $git->toggleAutoDeploy($application, false);
        $git->deleteProviderWebhook($application);

        $this->assertSame(['enable', 'disable', 'deleteProviderWebhook'], $hooks->calls);
        $this->assertFalse(method_exists($git, 'importAutoDeployDeliveries'));
    }

    /**
     * @return list<string>
     */
    private function sortedMethods(\ReflectionClass $reflection): array
    {
        $methods = array_map(static fn (\ReflectionMethod $m): string => $m->getName(), $reflection->getMethods());
        sort($methods);

        return $methods;
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function application(User $user, array $details = ['template' => 'dind']): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['details' => $details]),
        ]])]);

        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        return Application::query()->where('engine_username', 'site1')->firstOrFail();
    }
}

/**
 * Test-only operation recorder: records the calls and answers a sentinel without
 * running the Engine closure, so a GitService that bypassed the seam would hit
 * the Engine (and the stray-request guard).
 */
final class W2RecordingGitOperationRecorder implements GitOperationRecorder
{
    /** @var list<string> */
    public array $calls = [];

    public function record(Application $application, string $action, callable $operation, ?callable $status = null, ?string $skippedMessage = null, array $attributes = []): mixed
    {
        $this->calls[] = 'record';

        return ['nothing_to_push' => true];
    }

    public function recordClone(Application $application): void
    {
        $this->calls[] = 'recordClone';
    }

    public function recordWebhookPull(Application $application, array $delivery, ?Carbon $createdAt, bool $finished, ?string $result): void
    {
        $this->calls[] = 'recordWebhookPull';
    }
}

/**
 * Test-only auto-deploy seam recorder.
 */
final class W2RecordingGitAutoDeployHooks implements GitAutoDeployHooks
{
    /** @var list<string> */
    public array $calls = [];

    public function enable(Application $application): void
    {
        $this->calls[] = 'enable';
    }

    public function disable(Application $application): void
    {
        $this->calls[] = 'disable';
    }

    public function rotate(Application $application): void
    {
        $this->calls[] = 'rotate';
    }

    public function deleteProviderWebhook(Application $application): void
    {
        $this->calls[] = 'deleteProviderWebhook';
    }

}
