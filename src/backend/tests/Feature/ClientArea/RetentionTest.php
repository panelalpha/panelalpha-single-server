<?php

namespace Tests\Feature\ClientArea;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Models\GitOperation;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Retention: activity_logs, notifications and git_operations are pruned past
 * their TTL. The `deploy_logs` retention left with the table (the Engine keeps
 * its own deploy logs; the task tails keep their newest ten, `DeployHistoryTest`).
 */
class RetentionTest extends TestCase
{
    use RefreshDatabase;

    private function application(string $username = 'site1'): Application
    {
        return Application::query()->create([
            'engine_id' => 1,
            'engine_username' => $username,
            'domain' => 'site1.example.com',
            'status' => 'active',
        ]);
    }

    public function test_activity_logs_are_prunable_past_the_ttl(): void
    {
        config(['client-area.activity_retention_days' => 90]);

        $application = $this->application();
        $old = ActivityLog::query()->create(['application_id' => $application->id, 'action' => 'old', 'request_method' => 'POST']);
        $old->forceFill(['created_at' => now()->subDays(120)])->save();
        ActivityLog::query()->create(['application_id' => $application->id, 'action' => 'recent', 'request_method' => 'POST']);

        $this->artisan('model:prune', ['--model' => [ActivityLog::class]])->assertSuccessful();

        $this->assertSame(0, ActivityLog::query()->where('action', 'old')->count());
        $this->assertSame(1, ActivityLog::query()->where('action', 'recent')->count());
    }

    public function test_the_scheduled_prune_event_targets_prunable_models(): void
    {
        // The scheduler registers `model:prune --model=…` in routes/console.php
        // (the host's notifications) and in the controller's provider (the
        // activity log, and the git-operation log, which moved from
        // client-area-legacy's own entry), so each package
        // prunes only its own models. `model:prune`
        // silently skips a class it cannot find, so every
        // scheduled model of every entry must exist *and* be prunable – a wrong
        // `App\Models\…` class would stay green otherwise.
        $events = collect($this->app->make(Schedule::class)->events())
            ->filter(fn ($event) => str_contains((string) $event->command, 'model:prune'))
            ->values();

        $this->assertCount(2, $events, 'Expected the host and the controller model:prune entries (legacy has none).');

        $byName = [];
        foreach ($events as $event) {
            preg_match_all("/--model='([^']+)'/", (string) $event->command, $matches);
            $byName[(string) $event->description] = $matches[1];
        }

        $this->assertSame([
            'prune-client-area-tables' => [ActivityLog::class, GitOperation::class],
            'prune-panel-tables' => [Notification::class],
        ], collect($byName)->sortKeys()->all());

        $models = array_merge(...array_values($byName));
        $this->assertNotEmpty($models, 'No --model value found in the scheduled model:prune commands.');

        foreach ($models as $model) {
            $this->assertTrue(class_exists($model), "{$model} does not exist; model:prune silently skips it.");
            $traits = class_uses_recursive($model);
            $this->assertTrue(
                in_array(Prunable::class, $traits, true) || in_array(MassPrunable::class, $traits, true),
                "{$model} is neither Prunable nor MassPrunable.",
            );
        }

        // The package model is the one that exists; the host-app name must not
        // come back.
        $this->assertContains('PanelAlpha\\ClientArea\\Models\\ActivityLog', $models);
        $this->assertContains('PanelAlpha\\ClientArea\\Models\\GitOperation', $models);
        $this->assertNotContains('App\\Models\\ActivityLog', $models);
    }

    public function test_the_scheduler_prunes_failed_jobs(): void
    {
        // failed_jobs is pruned by the scheduler, so a job that
        // somehow lands there does not pile up.
        $event = collect($this->app->make(Schedule::class)->events())
            ->first(fn ($event) => str_contains((string) $event->command, 'queue:prune-failed'));

        $this->assertNotNull($event, 'queue:prune-failed is not scheduled.');
    }

    public function test_notifications_are_prunable_past_the_ttl(): void
    {
        config(['notifications.retention_days' => 90]);

        $user = User::factory()->create();
        $old = $user->notifications()->create([
            'id' => (string) Str::uuid(),
            'type' => 'user.instance.redeploy_finished',
            'data' => ['type' => 'user.instance.redeploy_finished'],
        ]);
        $old->forceFill(['created_at' => now()->subDays(120)])->save();
        $user->notifications()->create([
            'id' => (string) Str::uuid(),
            'type' => 'user.instance.redeploy_finished',
            'data' => ['type' => 'user.instance.redeploy_finished'],
        ]);

        $this->artisan('model:prune', ['--model' => [Notification::class]])->assertSuccessful();

        $this->assertSame(1, $user->notifications()->count());
    }

    /**
     * Each legacy TTL is read from the legacy `client-area-legacy`
     * key; the notifications TTL from the host's `notifications`
     * key; the activity TTL from the controller's `client-area`
     * key; the git-operation TTL from `client-area` too. A non-default TTL proves the reader, which a test at the default
     * cannot.
     *
     * @return array<string, array{string}>
     */
    public static function prunableModels(): array
    {
        return [
            'activity_logs' => ['client-area.activity_retention_days'],
            'notifications' => ['notifications.retention_days'],
            'git_operations' => ['client-area.git_operation_retention_days'],
        ];
    }

    #[DataProvider('prunableModels')]
    public function test_each_ttl_is_read_from_its_retention_config(string $key): void
    {
        config([$key => 10]);

        $application = $this->application();
        $user = User::factory()->create();
        $create = match ($key) {
            'client-area.activity_retention_days' => fn (string $action) => ActivityLog::query()->create(['application_id' => $application->id, 'action' => $action, 'request_method' => 'POST']),
            'notifications.retention_days' => fn (string $action) => $user->notifications()->create(['id' => (string) Str::uuid(), 'type' => $action, 'data' => ['type' => $action]]),
            default => fn (string $action) => GitOperation::query()->create(['application_id' => $application->id, 'action' => $action, 'status' => GitOperation::STATUS_FAILED]),
        };
        $model = match ($key) {
            'client-area.activity_retention_days' => ActivityLog::class,
            'notifications.retention_days' => Notification::class,
            default => GitOperation::class,
        };
        $column = $model === Notification::class ? 'type' : 'action';

        // 20 days is inside every default TTL (90, 90, 30) but past the
        // configured 10, so only the configured value prunes it.
        $create('old')->forceFill(['created_at' => now()->subDays(20)])->save();
        $create('recent')->forceFill(['created_at' => now()->subDays(5)])->save();

        $this->artisan('model:prune', ['--model' => [$model]])->assertSuccessful();

        $this->assertSame(0, $model::query()->where($column, 'old')->count());
        $this->assertSame(1, $model::query()->where($column, 'recent')->count());
    }
}
