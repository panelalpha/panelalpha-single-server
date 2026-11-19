<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\EngineProjectsSynced;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\Hub\HubPairing;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * What the Community panel tells PanelAlpha Hub so that its Hub page matches a
 * connected Engine's (contract §6 and
 * §6a): the host facts, the last five minutes' averages with the throughput,
 * each app's id and Engine facts, and the monitoring events.
 */
class HubPanelDetailsTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    private const HUB = 'https://hub.test';

    private const REPORT = self::HUB.'/api/panel/v1/report';

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => self::HUB]);
        $this->configureEngine();
        User::factory()->create();
        app(HubPairing::class)->store('srv_1', 'the-server-secret', self::HUB, 'Acme', 'https://panel.example.com');
        Queue::fake();
        Notification::fake();
    }

    /**
     * A mirrored project, synced just now unless the attributes say otherwise.
     *
     * @param  array<string, mixed>|null  $payload
     * @param  array<string, mixed>  $attributes
     */
    private function app(string $username, ?array $payload = null, array $attributes = []): Application
    {
        return Application::query()->create($attributes + [
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_project_id' => 1,
            'engine_username' => $username,
            'name' => $username,
            'domain' => $username.'.example.com',
            'status' => 'active',
            'type' => 'custom',
            'engine_payload' => $payload,
            'synced_at' => now(),
        ]);
    }

    /**
     * One `projects/all` item as the sync mirrors it (Engine
     * core/app/Http/Resources/UserResource.php:58-62: app, usage, config).
     *
     * @param  array<string, mixed>  $app
     * @param  array<string, mixed>  $details
     * @return array<string, mixed>
     */
    private static function project(string $username, array $app = [], array $details = []): array
    {
        return [
            'username' => $username,
            'status' => 'active',
            'app' => $app + ['type' => 'node', 'framework' => 'nextjs', 'label' => 'Next.js', 'status' => 'live'],
            'details' => $details + ['template' => 'dind', 'health_checked' => true, 'health_healthy' => true],
            'config' => ['cpu_limit' => 1.5, 'memory_limit' => 1024, 'disk_space_limit' => -1],
            'usage' => ['cpu_percent' => 8.44, 'memory_bytes' => 412090368, 'memory_limit_bytes' => 1073741824, 'sampled_at' => '2026-11-19T09:00:00Z'],
            'disk' => ['files_bytes' => 100, 'docker_bytes' => 200, 'total_bytes' => 300, 'limit_bytes' => -1, 'measured_at' => '2026-11-19T08:45:00+00:00'],
            'created_at' => '2026-09-14T08:21:00.000000Z',
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function hubEvents(): array
    {
        return DB::table('hub_events')->orderBy('id')
            ->get(['event_type', 'app_id', 'app_name', 'reason', 'occurred_at'])
            ->map(fn (object $row): array => (array) $row)
            ->all();
    }

    public function test_the_report_carries_the_host_facts_like_a_connected_engine(): void
    {
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::REPORT => Http::response([], 200),
            // Engine: core/app/Http/Controllers/SystemController.php:64
            'engine.example.com/api/system/info' => Http::response(['data' => [
                'version' => '2.3.1',
                'default_ipv4' => TestNetwork::public(7),
                'host' => ['hostname' => 'srv1', 'os' => 'Ubuntu 24.04.3 LTS', 'kernel' => '6.8.0-85-generic', 'uptime_seconds' => 864000, 'ipv4' => null],
            ]]),
            // Defensive (not an Engine shape): an Engine failing with a 500 on every other call
            'engine.example.com/*' => Http::response([], 500),
        ]);

        $this->artisan('hub:report')->assertSuccessful();

        Http::assertSent(fn (Request $r): bool => $r->url() === self::REPORT && $r['host'] === [
            'hostname' => 'srv1',
            'os' => 'Ubuntu 24.04.3 LTS',
            'kernel' => '6.8.0-85-generic',
            'uptime_seconds' => 864000,
            // `host.ipv4` unknown: the Engine's default IPv4.
            'public_ipv4' => TestNetwork::public(7),
        ]);
    }

    public function test_an_engine_that_names_no_host_leaves_the_host_out(): void
    {
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::REPORT => Http::response([], 200),
            // Defensive (not an Engine shape): an Engine failing with a 500 on every call
            'engine.example.com/*' => Http::response([], 500),
        ]);

        $this->artisan('hub:report')->assertSuccessful();

        Http::assertSent(fn (Request $r): bool => $r->url() === self::REPORT && ! isset($r['host']));
    }

    public function test_usage_is_the_average_of_the_last_five_minutes_with_the_throughput(): void
    {
        $bucket = fn (string $minute, float $cpu, float $netIn, float $diskRead): array => [
            'period' => "2026-11-19 09:{$minute}:00", 'cpu_percent' => $cpu, 'ram_percent' => 50.0, 'disk_percent' => 61.2,
            'net_in_bps' => $netIn, 'net_out_bps' => 1000.0, 'disk_read_bps' => $diskRead, 'disk_write_bps' => 204800.4,
        ];
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::REPORT => Http::response([], 200),
            // Engine: core/app/Lib/Host/ServerMetricsHistory.php:30 -> for('1h'), one-minute buckets, oldest first
            'engine.example.com/api/metrics/history*' => Http::response(['data' => [
                $bucket('00', 99.0, 9999.0, 9999.0),
                $bucket('01', 99.0, 9999.0, 9999.0),
                $bucket('02', 10.0, 100.0, 0.0),
                // A minute without samples carries only its period.
                ['period' => '2026-11-19 09:03:00'],
                $bucket('04', 20.0, 200.0, 0.0),
                $bucket('05', 30.0, 300.0, 0.0),
                $bucket('06', 40.0, 400.0, 4.0),
            ], 'meta' => ['range' => '1h', 'bucket_seconds' => 60]]),
            // Engine: core/app/Http/Controllers/SystemController.php:64
            'engine.example.com/api/system/info' => Http::response(['data' => ['host' => ['cpu_cores' => 4]]]),
        ]);

        $this->artisan('hub:report')->assertSuccessful();

        Http::assertSent(fn (Request $r): bool => $r->url() === self::REPORT && $r['resource_usage'] === [
            'cpu_percent' => 25, 'ram_percent' => 50, 'disk_percent' => 61.2,
            'cpu_cores' => 4, 'ram_total_bytes' => null, 'disk_total_bytes' => null,
            'net_in_bps' => 250, 'net_out_bps' => 1000, 'disk_read_bps' => 1, 'disk_write_bps' => 204800,
        ]);
        Http::assertSent(fn (Request $r): bool => str_contains($r->url(), 'metrics/history?range=1h'));
        // The history had every percentage: no second read.
        Http::assertNotSent(fn (Request $r): bool => str_contains($r->url(), 'metrics/current'));
    }

    public function test_each_app_carries_its_id_and_what_the_engine_said_of_it_while_the_sync_is_recent(): void
    {
        Carbon::setTestNow('2026-11-19 09:02:00');
        $shop = $this->app('shop', self::project('shop'), ['engine_created_at' => '2026-09-14 08:21:00']);
        // Synced ten minutes ago: the Engine has not been read since, its facts are not now any more.
        $blog = $this->app('blog', self::project('blog'), ['synced_at' => now()->subMinutes(10), 'domain' => 'www.blog.example.com']);
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::REPORT => Http::response([], 200),
            // Engine: core/app/Http/Controllers/User/ProjectMetricsController.php:96 -> latestContainers
            'engine.example.com/api/projects/shop/containers/metrics' => Http::response(['data' => [
                ['container_id' => 'c1', 'name' => 'shop-app-1', 'service' => 'app', 'cpu_percent' => 6.14, 'memory_bytes' => 301989888, 'memory_limit_bytes' => 1073741824, 'sampled_at' => '2026-11-19T09:01:00Z'],
                ['container_id' => 'c2', 'name' => null, 'service' => 'db'],
            ]]),
            // Defensive (not an Engine shape): an Engine failing with a 500 on every other call
            'engine.example.com/*' => Http::response([], 500),
        ]);

        $this->artisan('hub:report')->assertSuccessful();

        Http::assertSent(fn (Request $r): bool => $r->url() === self::REPORT && $r['apps'] === [
            [
                'id' => (string) $shop->id,
                'name' => 'shop',
                'type' => 'custom',
                'status' => 'active',
                'public_url' => 'https://shop.example.com',
                'domain' => 'shop.example.com',
                'created_at' => '2026-09-14T08:21:00Z',
                'framework' => 'Next.js',
                'healthy' => true,
                // 1.5 CPUs, 1024 MB, no disk limit of its own (-1).
                'allocation' => ['cpu_cores' => 1.5, 'memory_bytes' => 1073741824, 'disk_bytes' => null],
                'usage' => ['cpu_percent' => 8.4, 'memory_bytes' => 412090368, 'memory_limit_bytes' => 1073741824],
                'disk' => ['bytes' => 300, 'files_bytes' => 100, 'docker_bytes' => 200, 'measured_at' => '2026-11-19T08:45:00Z'],
                'containers' => [
                    ['name' => 'shop-app-1', 'service' => 'app', 'cpu_percent' => 6.1, 'memory_bytes' => 301989888, 'memory_limit_bytes' => 1073741824],
                ],
            ],
            [
                'id' => (string) $blog->id,
                'name' => 'blog',
                'type' => 'custom',
                'status' => 'active',
                'public_url' => 'https://www.blog.example.com',
                // The domain the Client Area shows.
                'domain' => 'blog.example.com',
                'created_at' => null,
            ],
        ]);
        // Only the running container project with a recent sync is asked for its containers.
        Http::assertNotSent(fn (Request $r): bool => str_contains($r->url(), 'projects/blog'));
    }

    public function test_an_app_goes_down_and_comes_back_and_leaves_as_the_syncs_see_it(): void
    {
        Carbon::setTestNow('2026-11-19 09:00:00');
        $shop = $this->app('shop', self::project('shop'));
        $sync = function (?array $payload) use ($shop): void {
            if ($payload !== null) {
                $shop->update(['engine_payload' => $payload]);
            }
            Carbon::setTestNow(now()->addMinute());
            EngineProjectsSynced::dispatch(EngineConnection::DEFAULT_ID);
        };

        // The first sync after pairing only sets the baseline.
        $sync(null);
        $this->assertSame([], $this->hubEvents());

        $sync(self::project('shop', ['status' => 'down']));
        $sync(self::project('shop', ['status' => 'down']));
        // A redeploy says nothing of whether the app answers: the last state stays.
        $sync(self::project('shop', ['status' => 'building']));
        $sync(self::project('shop'));
        $sync(self::project('shop', [], ['health_healthy' => false]));
        $shop->delete();
        $sync(null);

        $id = (string) $shop->id;
        $this->assertSame([
            ['event_type' => 'app_down', 'app_id' => $id, 'app_name' => 'shop', 'reason' => 'The app is not running.', 'occurred_at' => '2026-11-19 09:02:00'],
            ['event_type' => 'app_up', 'app_id' => $id, 'app_name' => 'shop', 'reason' => null, 'occurred_at' => '2026-11-19 09:05:00'],
            ['event_type' => 'app_down', 'app_id' => $id, 'app_name' => 'shop', 'reason' => 'The app did not pass its last health check.', 'occurred_at' => '2026-11-19 09:06:00'],
            ['event_type' => 'app_removed', 'app_id' => $id, 'app_name' => 'shop', 'reason' => null, 'occurred_at' => '2026-11-19 09:07:00'],
        ], $this->hubEvents());
    }

    public function test_an_unpaired_panel_records_no_app_events_and_starts_over_when_paired(): void
    {
        $shop = $this->app('shop', self::project('shop'));
        EngineProjectsSynced::dispatch(EngineConnection::DEFAULT_ID);
        app(HubPairing::class)->forget();

        $shop->update(['engine_payload' => self::project('shop', ['status' => 'down'])]);
        EngineProjectsSynced::dispatch(EngineConnection::DEFAULT_ID);
        app(HubPairing::class)->store('srv_2', 'another-secret', self::HUB, 'Acme', 'https://panel.example.com');
        // Down before the pairing: the baseline, not an outage.
        EngineProjectsSynced::dispatch(EngineConnection::DEFAULT_ID);

        $this->assertSame([], $this->hubEvents());
    }

    public function test_a_project_still_being_created_is_not_an_app_that_was_removed(): void
    {
        $this->app('shop', self::project('shop'));
        $pending = $this->app('new', null, ['status' => 'pending']);
        EngineProjectsSynced::dispatch(EngineConnection::DEFAULT_ID);

        // The Engine rolled the create back.
        $pending->delete();
        EngineProjectsSynced::dispatch(EngineConnection::DEFAULT_ID);

        $this->assertSame([], $this->hubEvents());
    }

    public function test_an_install_outcome_carries_its_start_once_and_a_backup_its_outcome(): void
    {
        Carbon::setTestNow('2026-11-19 09:00:00');
        $shop = $this->app('shop', self::project('shop'), ['panel_created_at' => now()->subMinutes(3)]);
        $old = $this->app('blog', self::project('blog'), ['panel_created_at' => now()->subDays(3)]);

        ClientAreaNotificationRequested::dispatch($shop, 'user.instance.installation_finished');
        ClientAreaNotificationRequested::dispatch($shop, 'user.instance.installation_failed', 'Deploy failed: /home/shop/app exited 1', isError: true);
        ClientAreaNotificationRequested::dispatch($old, 'user.instance.installation_finished');
        ClientAreaNotificationRequested::dispatch($shop, 'user.instance.redeploy_finished');
        ClientAreaNotificationRequested::dispatch($shop, 'user.instance.backup.create_failed', 'Engine: disk full', isError: true);
        ClientAreaNotificationRequested::dispatch($shop, 'user.instance.backup.create_finished');
        ClientAreaNotificationRequested::dispatch($shop, 'user.instance.backup.restore_finished');

        $shopId = (string) $shop->id;
        $this->assertSame([
            ['event_type' => 'app_install_started', 'app_id' => $shopId, 'app_name' => 'shop', 'reason' => null, 'occurred_at' => '2026-11-19 08:57:00'],
            ['event_type' => 'app_install_succeeded', 'app_id' => $shopId, 'app_name' => 'shop', 'reason' => null, 'occurred_at' => '2026-11-19 09:00:00'],
            // Never the notification's own message: it may carry Engine output.
            ['event_type' => 'app_install_failed', 'app_id' => $shopId, 'app_name' => 'shop', 'reason' => 'The installation did not finish.', 'occurred_at' => '2026-11-19 09:00:00'],
            // Created days ago: whatever was installed now did not start with the project.
            ['event_type' => 'app_install_succeeded', 'app_id' => (string) $old->id, 'app_name' => 'blog', 'reason' => null, 'occurred_at' => '2026-11-19 09:00:00'],
            ['event_type' => 'backup_failed', 'app_id' => $shopId, 'app_name' => 'shop', 'reason' => 'The backup did not finish.', 'occurred_at' => '2026-11-19 09:00:00'],
            ['event_type' => 'backup_succeeded', 'app_id' => $shopId, 'app_name' => 'shop', 'reason' => null, 'occurred_at' => '2026-11-19 09:00:00'],
        ], $this->hubEvents());
    }

    public function test_the_recorded_events_reach_the_hub_with_their_own_time(): void
    {
        Carbon::setTestNow('2026-11-19 09:00:00');
        $shop = $this->app('shop', self::project('shop'), ['panel_created_at' => now()->subMinutes(3)]);
        ClientAreaNotificationRequested::dispatch($shop, 'user.instance.installation_finished');
        // Defensive (not an Engine shape): PanelAlpha Hub, POST /api/panel/v1/events answers 204 (hub/docs/hub-connect-contract.md §6a)
        Http::fake([self::HUB.'/api/panel/v1/events' => Http::response(null, 204)]);

        $this->artisan('hub:events')->assertSuccessful();

        Http::assertSent(fn (Request $r): bool => $r['events'] === [
            ['event_type' => 'app_install_started', 'app_id' => (string) $shop->id, 'app_name' => 'shop', 'reason' => null, 'occurred_at' => '2026-11-19T08:57:00Z'],
            ['event_type' => 'app_install_succeeded', 'app_id' => (string) $shop->id, 'app_name' => 'shop', 'reason' => null, 'occurred_at' => '2026-11-19T09:00:00Z'],
        ]);
    }
}
