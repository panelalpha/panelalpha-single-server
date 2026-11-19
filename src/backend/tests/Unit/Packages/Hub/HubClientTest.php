<?php

namespace Tests\Unit\Packages\Hub;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\Hub\Contracts\HubPanel;
use PanelAlpha\Hub\HubClient;
use PanelAlpha\Hub\HubPairing;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Calls to the Hub: the unsigned connect calls, the signed report and
 * disconnect, and the origin helpers. `docs/hub-connect-contract.md` is the
 * wire contract.
 */
final class HubClientTest extends TestCase
{
    private const HUB = 'https://hub.example.test';

    private InMemoryHubSettings $settings;

    private HubPairing $pairing;

    private StubHubPanel $panel;

    private HubClient $client;

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => self::HUB]);
        $this->settings = new InMemoryHubSettings;
        $this->pairing = new HubPairing($this->settings);
        $this->panel = new StubHubPanel(apps: [['name' => 'blog', 'type' => 'wordpress', 'status' => 'active']]);
        $this->client = new HubClient($this->pairing, $this->panel);
    }

    private function pair(): void
    {
        $this->pairing->store('srv_1', 'the-secret', self::HUB.'/', 'Acme', 'https://stored.example.com');
    }

    public function test_a_connect_request_sends_the_product_and_the_panel_facts_unsigned(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 1.1, POST /api/panel/v1/connect-requests (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(['*' => Http::response(['device_code' => 'dc', 'user_code' => 'ABCD-EFGH'], 201)]);
        $this->panel->ip = TestNetwork::public(9);
        $this->panel->licenseKey = 'LIC-1';

        $response = $this->client->createConnectRequest('https://panel.example.com');

        $this->assertSame(201, $response->status());
        Http::assertSent(function (Request $request): bool {
            return $request->url() === self::HUB.'/api/panel/v1/connect-requests'
                && $request->method() === 'POST'
                && ! $request->hasHeader('X-Signature')
                && $request->data() === [
                    'product' => HubPanel::COMMUNITY,
                    'panel' => ['version' => '1.9.0', 'admin_url' => 'https://panel.example.com', 'hostname' => 'box.example.com', 'ip' => TestNetwork::public(9)],
                    'license_key' => 'LIC-1',
                ];
        });
    }

    public function test_claiming_an_install_code_sends_the_code_the_email_and_the_panel_facts(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 1.7, POST /api/panel/v1/install-codes/claim (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(['*' => Http::response(['server_id' => 'srv_1'])]);

        $this->client->claimInstallCode('WDJB-MJHT', 'ada@example.com', 'https://panel.example.com');

        Http::assertSent(fn (Request $request): bool => $request->url() === self::HUB.'/api/panel/v1/install-codes/claim'
            && $request->data() === [
                'code' => 'WDJB-MJHT',
                'email' => 'ada@example.com',
                'product' => HubPanel::COMMUNITY,
                'panel' => ['version' => '1.9.0', 'admin_url' => 'https://panel.example.com', 'hostname' => 'box.example.com', 'ip' => ''],
            ]);
    }

    public function test_unsigned_calls_use_the_stored_hub_url_without_a_trailing_slash(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 1.2, POST /api/panel/v1/connect-requests/cancel (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(['*' => Http::response([], 200)]);
        $this->pairing->store('srv_1', 's', 'https://hub.stored.test/', null);

        $this->client->cancelConnectRequest('dc-1');

        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://hub.stored.test/api/panel/v1/connect-requests/cancel'
            && $request->data() === ['device_code' => 'dc-1']);
    }

    /**
     * @return array<string, array{0: float, 1: float}>
     */
    public static function pollBudgets(): array
    {
        return [
            'the default is five seconds' => [5.0, 5.0],
            'more than the cap is capped' => [60.0, 5.0],
            'less than the cap is kept' => [2.5, 2.5],
            'less than a second is a second' => [0.2, 1.0],
            'zero is a second' => [0.0, 1.0],
            'negative is a second' => [-3.0, 1.0],
        ];
    }

    #[DataProvider('pollBudgets')]
    public function test_a_poll_never_waits_longer_than_the_callers_budget_or_five_seconds(float $budget, float $expected): void
    {
        $timeouts = [];
        // Defensive (not an Engine shape): PanelAlpha Hub contract 1.4, POST /api/panel/v1/connect-requests/poll (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(function (Request $request, array $options) use (&$timeouts) {
            $timeouts[] = $options['timeout'] ?? null;

            // Defensive (not an Engine shape): PanelAlpha Hub contract 1.4 pending answer (src/packages/hub/docs/hub-connect-contract.md)
            return Http::response(['status' => 'pending']);
        });

        $this->client->pollConnectRequest('dc-1', $budget);

        $this->assertSame([$expected], $timeouts);
    }

    public function test_a_poll_without_a_budget_uses_the_default(): void
    {
        $timeouts = [];
        // Defensive (not an Engine shape): PanelAlpha Hub contract 1.4, POST /api/panel/v1/connect-requests/poll (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(function (Request $request, array $options) use (&$timeouts) {
            $timeouts[] = $options['timeout'] ?? null;

            // Defensive (not an Engine shape): PanelAlpha Hub contract 1.4 pending answer (src/packages/hub/docs/hub-connect-contract.md)
            return Http::response(['status' => 'pending']);
        });

        $this->client->pollConnectRequest('dc-1');

        $this->assertSame([5.0], $timeouts);
    }

    public function test_a_redirect_from_the_hub_is_not_followed(): void
    {
        // Defensive (not an Engine shape): HTTP 302 answer of any server; the Hub must never be able to send the panel elsewhere
        Http::fake(['*' => Http::response('', 302, ['Location' => 'https://evil.example.com/'])]);

        $response = $this->client->pollConnectRequest('dc-1');

        $this->assertSame(302, $response->status());
        Http::assertSentCount(1);
    }

    public function test_the_report_is_signed_over_the_path_the_time_and_the_body_hash(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, POST /api/panel/v1/report (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(['*' => Http::response([], 200)]);
        $this->pair();
        $this->client->report();

        Http::assertSent(function (Request $request): bool {
            // HubClient reads the clock with time(), which a frozen Carbon does not move.
            $timestamp = $request->header('X-Timestamp')[0];
            $canonical = implode("\n", ['POST', 'api/panel/v1/report', $timestamp, hash('sha256', $request->body())]);

            return $request->url() === self::HUB.'/api/panel/v1/report'
                && $request->header('X-Server-Id') === ['srv_1']
                && abs((int) $timestamp - time()) <= 5
                && $request->header('X-Signature') === [hash_hmac('sha256', $canonical, 'the-secret')]
                && $request->header('Content-Type') === ['application/json'];
        });
    }

    public function test_the_report_body_names_the_apps_the_version_and_the_product(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, POST /api/panel/v1/report (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(['*' => Http::response([], 200)]);
        $this->pair();

        $this->client->report();

        Http::assertSent(fn (Request $request): bool => json_decode($request->body(), true) === [
            'apps' => [['name' => 'blog', 'type' => 'wordpress', 'status' => 'active']],
            'panel_version' => '1.9.0',
            'admin_sso_supported' => true,
            'admin_url' => 'https://panel.example.com',
            'product' => HubPanel::COMMUNITY,
        ]);
    }

    public function test_a_panel_that_reports_its_host_sends_it_and_one_that_does_not_sends_none(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, POST /api/panel/v1/report (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(['*' => Http::response([], 200)]);
        $this->pair();
        $host = ['hostname' => 'srv1', 'os' => 'Ubuntu 24.04.3 LTS', 'kernel' => null, 'uptime_seconds' => 60, 'public_ipv4' => null];
        (new HubClient($this->pairing, new StubHubPanelWithHost($host)))->report();
        $this->client->report();

        $bodies = array_map(fn (array $pair): array => $pair[0]->data(), Http::recorded()->all());
        $this->assertSame($host, $bodies[0]['host']);
        $this->assertArrayNotHasKey('host', $bodies[1]);
    }

    public function test_an_app_over_four_kilobytes_loses_its_details_the_least_needed_first(): void
    {
        $app = [
            'id' => '7', 'name' => 'shop', 'type' => 'custom', 'status' => 'active',
            'framework' => 'Next.js', 'allocation' => ['cpu_cores' => 1], 'usage' => null,
            'disk' => ['bytes' => 1], 'containers' => array_fill(0, 40, ['name' => str_repeat('c', 80), 'service' => 'app']),
        ];

        $fitted = HubClient::fitApp($app);

        $this->assertArrayNotHasKey('containers', $fitted);
        $this->assertSame(array_diff_key($app, ['containers' => true]), $fitted);
        $this->assertSame($fitted, HubClient::fitApp($fitted));
        // Measured as the Hub measures it: an escaped slash counts twice.
        $long = ['id' => '8', 'name' => str_repeat('/', 2020), 'type' => '', 'status' => 'active', 'framework' => 'Next.js', 'containers' => []];
        $this->assertSame(['id' => '8', 'name' => str_repeat('/', 2020), 'type' => '', 'status' => 'active'], HubClient::fitApp($long));
    }

    public function test_events_are_signed_and_sent_as_one_batch(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6a, POST /api/panel/v1/events answers 204
        Http::fake(['*' => Http::response(null, 204)]);
        $this->pair();
        $events = [['event_type' => 'app_up', 'app_id' => '7', 'app_name' => 'shop', 'reason' => null, 'occurred_at' => '2026-11-19T09:00:00Z']];

        $this->assertSame(204, $this->client->events($events)->status());

        Http::assertSent(function (Request $request) use ($events): bool {
            $canonical = implode("\n", ['POST', 'api/panel/v1/events', $request->header('X-Timestamp')[0], hash('sha256', $request->body())]);

            return $request->url() === self::HUB.'/api/panel/v1/events'
                && $request->header('X-Signature') === [hash_hmac('sha256', $canonical, 'the-secret')]
                && $request->data() === ['events' => $events];
        });
    }

    public function test_a_401_on_the_events_forgets_the_pairing(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6a, a 401 means the Hub no longer knows this server
        Http::fake(['*' => Http::response(['error' => 'unknown_server'], 401)]);
        $this->pair();

        $this->client->events([]);

        $this->assertFalse($this->pairing->isPaired());
    }

    public function test_the_report_names_the_stored_address_when_the_panel_names_none(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, POST /api/panel/v1/report (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(['*' => Http::response([], 200)]);
        $this->pair();
        $this->panel->adminUrl = '';

        $this->client->report();

        Http::assertSent(fn (Request $request): bool => (json_decode($request->body(), true)['admin_url'] ?? null) === 'https://stored.example.com');
    }

    public function test_a_401_on_the_report_forgets_the_pairing(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, a 401 means the Hub no longer knows this server
        Http::fake(['*' => Http::response(['error' => 'unknown_server'], 401)]);
        $this->pair();

        $response = $this->client->report();

        $this->assertSame(401, $response->status());
        $this->assertFalse($this->pairing->isPaired());
        $this->assertSame([], $this->settings->values);
    }

    public function test_another_failure_on_the_report_keeps_the_pairing(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, any 5xx is retried by the schedule
        Http::fake(['*' => Http::response('', 503)]);
        $this->pair();

        $this->assertSame(503, $this->client->report()->status());
        $this->assertTrue($this->pairing->isPaired());
    }

    public function test_the_disconnect_is_signed_over_an_empty_body(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, POST /api/panel/v1/disconnect (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(['*' => Http::response([], 200)]);
        $this->pair();

        $this->client->disconnect();

        Http::assertSent(function (Request $request): bool {
            $canonical = implode("\n", ['POST', 'api/panel/v1/disconnect', $request->header('X-Timestamp')[0], hash('sha256', '[]')]);

            return $request->url() === self::HUB.'/api/panel/v1/disconnect'
                && $request->body() === '[]'
                && $request->header('X-Signature') === [hash_hmac('sha256', $canonical, 'the-secret')];
        });
    }

    public function test_a_transport_failure_reaches_the_caller(): void
    {
        // Defensive (not an Engine shape): Illuminate ConnectionException thrown by the HTTP client
        Http::fake(fn () => throw new ConnectionException('cURL error 6'));

        $this->expectException(ConnectionException::class);
        $this->client->pollConnectRequest('dc-1');
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function origins(): array
    {
        return [
            'a path is dropped' => ['https://panel.example.com/admin/home?x=1', 'https://panel.example.com'],
            'a port is kept' => ['http://panel.example.com:9080/a', 'http://panel.example.com:9080'],
            'no path' => ['https://panel.example.com', 'https://panel.example.com'],
            'no scheme returns the input without a trailing slash' => ['panel.example.com/', 'panel.example.com'],
            'an empty host returns the input' => ['https:///path', 'https:///path'],
            'empty' => ['', ''],
        ];
    }

    #[DataProvider('origins')]
    public function test_the_origin_is_scheme_host_and_port(string $url, string $expected): void
    {
        $this->assertSame($expected, HubClient::origin($url));
    }

    /**
     * @return array<string, array{0: string, 1: bool}>
     */
    public static function hubUrls(): array
    {
        return [
            'the hub itself' => ['https://hub.example.test/connect/approve', true],
            'the default https port is the same origin' => ['https://hub.example.test:443/x', true],
            'case does not matter' => ['HTTPS://HUB.Example.Test/x', true],
            'another host' => ['https://hub.evil.test/x', false],
            'a subdomain of the hub' => ['https://a.hub.example.test/x', false],
            'a lookalike suffix' => ['https://hub.example.test.evil.test/x', false],
            'another scheme' => ['http://hub.example.test/x', false],
            'another port' => ['https://hub.example.test:8443/x', false],
            'javascript' => ['javascript:alert(1)', false],
            'another scheme with the same host' => ['ftp://hub.example.test/x', false],
            'a file url' => ['file://hub.example.test/etc/passwd', false],
            'no host' => ['/relative/path', false],
            'empty' => ['', false],
            'userinfo trick' => ['https://hub.example.test@evil.test/x', false],
        ];
    }

    #[DataProvider('hubUrls')]
    public function test_only_a_url_on_the_configured_hub_origin_is_a_hub_url(string $url, bool $expected): void
    {
        $this->assertSame($expected, HubClient::isHubUrl($url));
    }

    public function test_an_http_hub_matches_on_port_80(): void
    {
        config(['hub.url' => 'http://hub.example.test']);

        $this->assertTrue(HubClient::isHubUrl('http://hub.example.test:80/x'));
        $this->assertFalse(HubClient::isHubUrl('https://hub.example.test/x'));
    }

    public function test_a_configured_hub_without_a_host_matches_nothing(): void
    {
        config(['hub.url' => 'not a url']);

        $this->assertFalse(HubClient::isHubUrl('https://hub.example.test/x'));
    }
}
