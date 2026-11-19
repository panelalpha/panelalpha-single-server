<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\EngineRunningTasks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * `/home` reads only the cache; the scheduler
 * refreshes it from `GET /tasks?status=active&scope=all&per_page=1` when the
 * value is older than the window, and an unreachable Engine keeps the badge off.
 *
 * @see Engine core/app/Http/Controllers/TaskController.php:91 -> TaskController::index
 */
class EngineRunningTasksTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_get_never_calls_the_engine_on_a_cache_miss(): void
    {
        $this->configureEngine();
        Http::preventStrayRequests();

        // Miss -> false, no Engine call.
        $this->assertFalse(app(EngineRunningTasks::class)->get());
        Http::assertNothingSent();
    }

    public function test_refresh_sets_the_flag_from_the_task_list(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index
        Http::fake(['engine.example.com/api/tasks*' => Http::response([
            'data' => [['id' => 55, 'status' => 'running']],
            'links' => [],
            'meta' => ['total' => 1],
        ])]);

        app(EngineRunningTasks::class)->refresh();

        $this->assertTrue(app(EngineRunningTasks::class)->get());
        Http::assertSent(fn ($request) => str_contains($request->url(), '/api/tasks')
            && $request['status'] === 'active'
            && $request['scope'] === 'all'
            && $request['per_page'] === 1);
    }

    public function test_refresh_clears_the_flag_when_no_task_is_active(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index
        Http::fake(['engine.example.com/api/tasks*' => Http::response([
            'data' => [],
            'links' => [],
            'meta' => ['total' => 0],
        ])]);

        app(EngineRunningTasks::class)->refresh();

        $this->assertFalse(app(EngineRunningTasks::class)->get());
    }

    public function test_refresh_clears_the_flag_when_the_engine_is_down(): void
    {
        $this->configureEngine();

        // First a true value, then the Engine goes down: the next refresh must
        // clear it.
// Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index
        Http::fake(['engine.example.com/api/tasks*' => Http::response(['data' => [['id' => 1]]])]);
        Carbon::setTestNow('2026-10-12 10:00:00');
        app(EngineRunningTasks::class)->refresh();
        $this->assertTrue(app(EngineRunningTasks::class)->get());

        Http::fake(['engine.example.com/api/tasks*' => fn () => throw new ConnectionException('down')]);
        Carbon::setTestNow('2026-10-12 10:01:00');
        app(EngineRunningTasks::class)->refresh();
        $this->assertFalse(app(EngineRunningTasks::class)->get());

        Carbon::setTestNow();
    }

    public function test_an_engine_5xx_keeps_the_flag_off(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index (Engine 5xx)
        Http::fake(['engine.example.com/api/tasks*' => Http::response(['message' => 'boom'], 500)]);

        app(EngineRunningTasks::class)->refresh();

        $this->assertFalse(app(EngineRunningTasks::class)->get());
    }

    public function test_get_ignores_a_cache_entry_that_did_not_succeed(): void
    {
        $this->configureEngine();

        // A legacy or foreign cache entry without the `ok` flag may not turn the
        // badge on: only a successful refresh writes `ok=true`.
        $engineId = app(EngineResolver::class)->forEngine(EngineConnection::DEFAULT_ID)->connection()->id;
        Cache::forever('host:engine-running-tasks:'.$engineId, ['running' => true]);

        $this->assertFalse(app(EngineRunningTasks::class)->get());
    }

    public function test_a_refresh_inside_the_window_is_skipped_and_a_stale_one_is_fetched(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index
        Http::fake(['engine.example.com/api/tasks*' => Http::response(['data' => [['id' => 1]]])]);

        Carbon::setTestNow('2026-10-12 10:00:00');
        app(EngineRunningTasks::class)->refresh();

        // Inside 30 s the minute-scheduler call makes no Engine call.
        Carbon::setTestNow('2026-10-12 10:00:10');
        app(EngineRunningTasks::class)->refresh();
        Http::assertSentCount(1);

        // After the window it refreshes again.
        Carbon::setTestNow('2026-10-12 10:01:00');
        app(EngineRunningTasks::class)->refresh();
        Http::assertSentCount(2);

        Carbon::setTestNow();
    }

    public function test_the_running_task_badge_reads_the_scheduler_cache_on_the_database_driver(): void
    {
        // The container runs the database cache store
        // (.panelalpha/panelalpha.yaml:63); the array store hides a
        // scheduler-write / web-read mismatch. Run both ends on
        // the real driver.
        config(['cache.default' => 'database']);
        Cache::store('database')->flush();
        $this->configureEngine();
// Engine: core/app/Http/Controllers/TaskController.php:91 -> TaskController::index
        Http::fake(['engine.example.com/api/tasks*' => Http::response([
            'data' => [['id' => 55, 'status' => 'running']],
            'links' => [],
            'meta' => ['total' => 1],
        ])]);

        // The scheduler writes the flag...
        app(EngineRunningTasks::class)->refresh();

        // ...and /home reads it back on the same driver. The badge is a
        // signed-in menu's, so a guest never gets it.
        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/components/navbar/UserInfoDropdown.vue:214 (app.single_server.has_running_tasks)
        $this->actingAs(User::factory()->create())->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('app.single_server.has_running_tasks', true);
    }

    public function test_the_cache_prefix_does_not_depend_on_the_process_app_name(): void
    {
        // The scheduler inherits the container APP_NAME
        // (.panelalpha/files/.env:6); php-fpm runs with clear_env=yes and
        // reads backend/.env only, where APP_NAME is unset. A prefix derived from
        // APP_NAME therefore addresses two different keyspaces.
        $web = $this->cachePrefixWithAppName(null);
        $scheduler = $this->cachePrefixWithAppName('PanelAlpha');

        $this->assertSame('panelalpha-v1-cache-', $web);
        $this->assertSame($web, $scheduler);
    }

    /**
     * Evaluate config/cache.php the way one process sees it: the scheduler with
     * the container's APP_NAME and php-fpm without it (clear_env=yes). The env is
     * restored afterwards so the test cannot leak into the next one.
     */
    private function cachePrefixWithAppName(?string $name): string
    {
        $previous = [
            'putenv' => getenv('APP_NAME'),
            'env' => $_ENV['APP_NAME'] ?? null,
            'server' => $_SERVER['APP_NAME'] ?? null,
        ];

        try {
            if ($name === null) {
                putenv('APP_NAME');
                unset($_ENV['APP_NAME'], $_SERVER['APP_NAME']);
            } else {
                putenv('APP_NAME='.$name);
                $_ENV['APP_NAME'] = $name;
                $_SERVER['APP_NAME'] = $name;
            }

            /** @var array<string, mixed> $config */
            $config = require base_path('config/cache.php');

            return is_string($config['prefix'] ?? null) ? $config['prefix'] : '';
        } finally {
            if ($previous['putenv'] === false) {
                putenv('APP_NAME');
            } else {
                putenv('APP_NAME='.$previous['putenv']);
            }
            if ($previous['env'] === null) {
                unset($_ENV['APP_NAME']);
            } else {
                $_ENV['APP_NAME'] = $previous['env'];
            }
            if ($previous['server'] === null) {
                unset($_SERVER['APP_NAME']);
            } else {
                $_SERVER['APP_NAME'] = $previous['server'];
            }
        }
    }
}
