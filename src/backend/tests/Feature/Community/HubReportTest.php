<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event as Events;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\Hub\HubPairing;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The 5-minute signed report to PanelAlpha Hub (`hub:report`).
 */
class HubReportTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    private const HUB = 'https://hub.test';

    private const SECRET = 'the-server-secret';

    private const REPORT = self::HUB.'/api/panel/v1/report';

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => self::HUB]);
        $this->configureEngine();
        User::factory()->create();
    }

    private function pair(): void
    {
        app(HubPairing::class)->store('srv_1', self::SECRET, self::HUB, 'Acme', 'http://'.TestNetwork::LOOPBACK.':9080');
    }

    private function app(string $name, string $status = 'active', ?string $type = 'wordpress', int $id = 10): void
    {
        Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_project_id' => $id,
            'engine_username' => 'u'.$id,
            'name' => $name,
            'domain' => $name.'.example.com',
            'status' => $status,
            'type' => $type,
        ]);
    }

    public function test_the_report_is_scheduled_every_five_minutes_without_overlap(): void
    {
        $events = collect($this->app->make(Schedule::class)->events())
            ->filter(fn (Event $e) => $e->description === 'hub-report');

        $this->assertCount(1, $events);
        $event = $events->first();
        $this->assertSame('*/5 * * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }

    public function test_the_report_carries_a_signature_the_hub_can_recompute(): void
    {
        $this->pair();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        Http::fake([self::REPORT => Http::response([], 200)]);

        $this->artisan('hub:report')->assertSuccessful();

        Http::assertSentCount(1);
        Http::assertSent(function (Request $r): bool {
            $canonical = implode("\n", ['POST', 'api/panel/v1/report', $r->header('X-Timestamp')[0], hash('sha256', $r->body())]);

            return $r->url() === self::REPORT
                && $r->header('X-Server-Id') === ['srv_1']
                && $r->header('X-Signature') === [hash_hmac('sha256', $canonical, self::SECRET)];
        });
    }

    public function test_the_body_lists_the_synced_applications_without_an_engine_call(): void
    {
        $this->pair();
        config(['app.url' => 'https://panel.example.com']);
        $this->app('blog', 'active', 'wordpress', 10);
        $this->app('shop', 'suspended', null, 11);
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        Http::fake([self::REPORT => Http::response([], 200)]);

        $this->artisan('hub:report')->assertSuccessful();

        [$blog, $shop] = Application::query()->orderBy('id')->pluck('id')->map(fn ($id) => (string) $id)->all();
        Http::assertSent(fn (Request $r) => $r->url() === self::REPORT && $r->data() === [
            'apps' => [
                ['id' => $blog, 'name' => 'blog', 'type' => 'wordpress', 'status' => 'active', 'public_url' => 'https://blog.example.com', 'domain' => 'blog.example.com', 'created_at' => null],
                ['id' => $shop, 'name' => 'shop', 'type' => '', 'status' => 'suspended', 'public_url' => 'https://shop.example.com', 'domain' => 'shop.example.com', 'created_at' => null],
            ],
            'panel_version' => '2.0.0-beta',
            'admin_sso_supported' => true,
            'admin_url' => 'https://panel.example.com',
            'product' => 'single-server-community',
        ]);
        // The app list comes from the local mirror: no project read on the Engine.
        Http::assertNotSent(fn (Request $r): bool => str_contains($r->url(), '/projects'));
    }

    public function test_the_report_carries_the_server_usage_and_engine_version_like_a_connected_engine(): void
    {
        $this->pair();
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::REPORT => Http::response([], 200),
            // Engine: core/app/Lib/Host/MetricBuckets.php:56 -> periods(), a bucket without samples carries only its period
            'engine.example.com/api/metrics/history*' => Http::response(['data' => [['period' => '2026-11-19 09:00:00']]], 200),
            // Engine: core/app/Http/Controllers/ServerMetricsController.php:35 -> current()
            'engine.example.com/api/metrics/current' => Http::response(['data' => [
                'cpu_usage_percent' => 12.54, 'ram_usage_percent' => 41, 'disk_usage_percent' => 128,
            ]], 200),
            // Engine: core/app/Http/Controllers/SystemController.php:41 -> SystemController::info
            'engine.example.com/api/system/info' => Http::response(['data' => [
                'version' => '2.3.1',
                'host' => ['hostname' => 'engine', 'cpu_cores' => 4, 'memory_total_bytes' => 8589934592, 'disk_total_bytes' => 107374182400],
            ]], 200),
        ]);

        $this->artisan('hub:report')->assertSuccessful();

        Http::assertSent(fn (Request $r): bool => $r->url() === self::REPORT
            && $r['resource_usage'] === [
                // JSON carries 41.0 and 100.0 as 41 and 100.
                'cpu_percent' => 12.5, 'ram_percent' => 41, 'disk_percent' => 100,
                'cpu_cores' => 4, 'ram_total_bytes' => 8589934592, 'disk_total_bytes' => 107374182400,
                // No samples in the history: no throughput.
                'net_in_bps' => null, 'net_out_bps' => null, 'disk_read_bps' => null, 'disk_write_bps' => null,
            ]
            && $r['engine_version'] === '2.3.1');
    }

    public function test_an_engine_that_is_down_leaves_usage_out_and_the_report_still_goes(): void
    {
        $this->pair();
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::REPORT => Http::response([], 200),
            // Defensive (not an Engine shape): an Engine failing with a 500 on every call
            'engine.example.com/*' => Http::response([], 500),
        ]);

        $this->artisan('hub:report')->assertSuccessful();

        Http::assertSent(fn (Request $r): bool => $r->url() === self::REPORT
            && ! isset($r['resource_usage']) && ! isset($r['engine_version']));
    }

    public function test_the_report_names_the_panel_s_address_now_not_the_one_stored_at_pairing(): void
    {
        // Paired on http://LOOPBACK:9080; the Engine renamed the panel's domain since (APP_URL follows it).
        $this->pair();
        config(['app.url' => 'https://moved.example.com']);
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        Http::fake([self::REPORT => Http::response([], 200)]);

        $this->artisan('hub:report')->assertSuccessful();
        Http::assertSent(fn (Request $r): bool => $r['admin_url'] === 'https://moved.example.com');

        // The Application URL the owner saved wins over APP_URL.
        app(PanelSettings::class)->set('userapp.url', 'https://panel.example.org:9999');
        $this->artisan('hub:report')->assertSuccessful();
        Http::assertSent(fn (Request $r): bool => $r['admin_url'] === 'https://panel.example.org:9999');
    }

    public function test_the_origin_stored_at_pairing_is_reported_when_the_panel_names_none(): void
    {
        $this->pair();
        config(['app.url' => '']);
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        Http::fake([self::REPORT => Http::response([], 200)]);

        $this->artisan('hub:report')->assertSuccessful();
        Http::assertSent(fn (Request $r): bool => $r['admin_url'] === 'http://'.TestNetwork::LOOPBACK.':9080');
    }

    public function test_an_application_without_a_name_is_reported_under_the_name_the_client_area_shows(): void
    {
        $this->pair();
        $this->app('blog', 'active', 'wordpress', 10);
        Application::query()->where('engine_project_id', 10)->update(['name' => null]);
        Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_project_id' => 11,
            'engine_username' => '',
            'name' => null,
            'domain' => 'shop.example.com',
            'status' => 'active',
            'type' => 'custom',
        ]);
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        Http::fake([self::REPORT => Http::response([], 200)]);

        $this->artisan('hub:report')->assertSuccessful();

        Http::assertSent(fn (Request $r) => $r->url() === self::REPORT && array_map(
            fn (array $app): array => array_intersect_key($app, array_flip(['name', 'type', 'status', 'public_url'])),
            $r->data()['apps'],
        ) === [
            ['name' => 'u10', 'type' => 'wordpress', 'status' => 'active', 'public_url' => 'https://blog.example.com'],
            ['name' => 'shop.example.com', 'type' => 'custom', 'status' => 'active', 'public_url' => 'https://shop.example.com'],
        ]);
    }

    public function test_a_panel_without_applications_still_reports_an_empty_list(): void
    {
        $this->pair();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        Http::fake([self::REPORT => Http::response([], 200)]);

        $this->artisan('hub:report')->assertSuccessful();

        Http::assertSent(fn (Request $r) => $r->data()['apps'] === [] && str_contains($r->body(), '"apps":[]'));
    }

    public function test_a_401_forgets_the_whole_pairing(): void
    {
        $this->pair();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        Http::fake([self::REPORT => Http::response(['error' => 'unknown_server'], 401)]);

        // Not a failure of the command: the Hub forgot the panel, so the panel forgets the pairing.
        $this->artisan('hub:report')->expectsOutput('PanelAlpha no longer knows this panel, the connection was removed.')->assertSuccessful();

        $settings = app(PanelSettings::class);
        foreach (['server_id', 'server_secret', 'hub_url', 'account_name', 'connected_at', 'admin_url'] as $key) {
            $this->assertNull($settings->get('hub.'.$key), $key);
        }
        $this->assertFalse(app(HubPairing::class)->isPaired());
    }

    public function test_nothing_is_sent_when_the_panel_is_not_paired(): void
    {
        Http::fake();

        $this->artisan('hub:report')->assertSuccessful();

        Http::assertNothingSent();
    }

    public function test_a_422_is_logged_with_the_status_and_code_but_not_the_secret_or_signature(): void
    {
        $this->pair();
        $signatures = [];
        Http::fake([self::REPORT => function (Request $r) use (&$signatures) {
            $signatures[] = $r->header('X-Signature')[0];

            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            return Http::response(['error' => 'invalid_report', 'message' => 'apps is required'], 422);
        }]);
        $records = [];
        Events::listen(MessageLogged::class, function (MessageLogged $e) use (&$records): void {
            $records[] = ['level' => $e->level, 'text' => $e->message.json_encode($e->context)];
        });

        $this->artisan('hub:report')->assertFailed();

        $warnings = array_values(array_filter($records, fn (array $r) => $r['level'] === 'warning'));
        $this->assertCount(1, $warnings);
        $this->assertStringContainsString('422', $warnings[0]['text']);
        $this->assertStringContainsString('invalid_report', $warnings[0]['text']);
        foreach ($records as $record) {
            $this->assertStringNotContainsString(self::SECRET, $record['text']);
            $this->assertStringNotContainsString($signatures[0], $record['text']);
        }
        // A 422 is not a revoked pairing.
        $this->assertTrue(app(HubPairing::class)->isPaired());
    }

    public function test_a_hub_that_cannot_be_reached_is_logged_without_the_url_or_secret(): void
    {
        $this->pair();
        Http::fake([self::REPORT => fn () => throw new \Illuminate\Http\Client\ConnectionException('down '.self::SECRET)]);
        $records = [];
        Events::listen(MessageLogged::class, function (MessageLogged $e) use (&$records): void {
            $records[] = $e->message.json_encode($e->context);
        });

        $this->artisan('hub:report')->assertFailed();

        $this->assertNotEmpty($records);
        foreach ($records as $record) {
            $this->assertStringNotContainsString(self::SECRET, $record);
        }
    }
}
