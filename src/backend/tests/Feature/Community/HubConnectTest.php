<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Contracts\FirstUserCreator;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\Community\Hub\Sleeper;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The setup wizard's Hub step (`/api/community/hub/*`).
 */
class HubConnectTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    private const HUB = 'https://hub.test';

    private const ORIGIN = 'http://'.TestNetwork::LOOPBACK.':9080';

    /** @var list<float> */
    private array $pauses = [];

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => self::HUB, 'app.url' => self::ORIGIN]);
        $this->configureEngine();
        $this->pauses = [];
        $this->app->instance(Sleeper::class, new class($this->pauses) extends Sleeper
        {
            /** @param list<float> $pauses */
            public function __construct(private array &$pauses) {}

            public function sleep(float $seconds): void
            {
                $this->pauses[] = round($seconds, 1);
            }
        });
    }

    /** A key left out of the faked Hub answer. */
    private const string ABSENT = '(absent)';

    /** The Hub user who approved (contract 1.4): the pairing keeps their id. */
    private const array APPROVER = ['id' => 128, 'email' => 'ada@example.com', 'name' => 'Ada Lovelace'];

    private function signedIn(): static
    {
        return $this->actingAs(User::factory()->create())->withHeader('Origin', self::ORIGIN);
    }

    private function fakeHub(array $extra = []): void
    {
        Http::fake($extra + [
            // Defensive (not an Engine shape): only the two fields the panel reads (default_ipv4, host.hostname) are faked.
            self::ENGINE.'/system/info' => Http::response(['data' => [
                'default_ipv4' => TestNetwork::public(7),
                'host' => ['hostname' => 'box.example.com'],
            ]]),
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::HUB.'/api/panel/v1/connect-requests' => Http::response([
                'device_code' => 'DEVICE-SECRET-CODE',
                'user_code' => 'ABCD-1234',
                'link' => self::HUB.'/connect/ABCD',
                'expires_in' => 900,
            ], 201),
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::HUB.'/api/panel/v1/connect-requests/cancel' => Http::response([], 200),
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::HUB.'/api/panel/v1/report' => Http::response([], 200),
        ]);
    }

    /**
     * Start a request and return the state the wizard would get back.
     */
    private function start(): string
    {
        // CA: packages/client-area/src/apis/Setup.js:16
        $link = $this->postJson('/api/community/hub/start', ['admin_url' => self::ORIGIN.'/some/path'])
            ->assertOk()->json('link');
        parse_str((string) parse_url($link, PHP_URL_QUERY), $query);

        return $query['state'];
    }

    public function test_a_guest_gets_401(): void
    {
        // Once the setup is done a guest has no access (while it is required, see the Connect setup tests).
        User::factory()->create();
        // CA: packages/client-area/src/apis/Setup.js:13
        $this->withHeader('Origin', self::ORIGIN)->getJson('/api/community/hub')->assertUnauthorized();
        // CA: packages/client-area/src/apis/Setup.js:16
        $this->withHeader('Origin', self::ORIGIN)->postJson('/api/community/hub/start')->assertUnauthorized();
        // CA: packages/client-area/src/apis/Setup.js:21
        $this->withHeader('Origin', self::ORIGIN)->postJson('/api/community/hub/complete')->assertUnauthorized();
        // CA: packages/client-area/src/apis/Setup.js:24
        $this->withHeader('Origin', self::ORIGIN)->postJson('/api/community/hub/cancel')->assertUnauthorized();
        // CA: packages/client-area/src/apis/Setup.js:27
        $this->withHeader('Origin', self::ORIGIN)->postJson('/api/community/hub/disconnect')->assertUnauthorized();
    }

    public function test_status_reports_the_pairing(): void
    {
        $this->signedIn()->getJson('/api/community/hub')
            ->assertOk()
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertExactJson(['paired' => false, 'hub_url' => self::HUB, 'account_name' => null, 'connected_at' => null]);
    }

    public function test_every_hub_route_is_a_404_outside_single_user_mode(): void
    {
        $this->bindMultiUserEdition([]);
        $this->fakeHub();
        $client = $this->signedIn();

        $client->getJson('/api/community/hub')->assertNotFound();
        $client->postJson('/api/community/hub/start', ['admin_url' => self::ORIGIN])->assertNotFound();
        $client->postJson('/api/community/hub/complete', ['state' => 'x', 'result' => 'approved'])->assertNotFound();
        $client->postJson('/api/community/hub/cancel')->assertNotFound();
        $client->postJson('/api/community/hub/disconnect')->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_the_hub_routes_are_throttled(): void
    {
        $client = $this->signedIn();
        for ($i = 0; $i < 30; $i++) {
            $client->getJson('/api/community/hub')->assertOk();
        }

        $client->getJson('/api/community/hub')->assertStatus(429);
    }

    public function test_a_401_on_the_first_report_is_not_a_connection(): void
    {
        $this->fakeHub([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response([
                'server_id' => 'srv_1',
                'server_secret' => 'the-server-secret',
                'user' => self::APPROVER,
                'hub_url' => self::HUB,
            ]),
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::HUB.'/api/panel/v1/report' => Http::response(['error' => 'unknown_server'], 401),
        ]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'expired');

        $this->assertNull(app(PanelSettings::class)->get('hub.server_id'));
        // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
        $client->getJson('/api/community/hub')->assertJsonPath('paired', false);
    }

    public function test_array_inputs_are_a_422_not_a_500(): void
    {
        $this->fakeHub();
        $client = $this->signedIn();

        $client->postJson('/api/community/hub/start', ['admin_url' => ['x']])->assertStatus(422);
        $client->postJson('/api/community/hub/complete', ['state' => ['x'], 'result' => 'approved'])->assertStatus(422);
    }

    public function test_start_sends_the_exact_payload_and_keeps_the_device_code_server_side(): void
    {
        $this->fakeHub();

        $response = $this->signedIn()->postJson('/api/community/hub/start', ['admin_url' => self::ORIGIN.'/some/path'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonStructure(['user_code', 'link', 'expires_in']);

        $this->assertStringNotContainsString('DEVICE-SECRET-CODE', $response->getContent());
        $this->assertStringContainsString('state=', $response->json('link'));
        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/connect-requests'
            && $r->data() === [
                'product' => 'single-server-community',
                'panel' => [
                    'version' => '2.0.0-beta',
                    'admin_url' => self::ORIGIN,
                    'hostname' => 'box.example.com',
                    'ip' => TestNetwork::public(7),
                ],
                'license_key' => null,
            ]);
    }

    public function test_start_still_sends_the_request_when_the_engine_is_down(): void
    {
        // Defensive (not an Engine shape): the fake only proves that start() survives an Engine failure.
        $this->fakeHub([self::ENGINE.'/system/info' => Http::response([], 500)]);

        $this->signedIn()->postJson('/api/community/hub/start', ['admin_url' => self::ORIGIN])->assertOk();

        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/connect-requests'
            && $r->data()['panel']['ip'] === ''
            && $r->data()['panel']['hostname'] === TestNetwork::LOOPBACK);
    }

    /**
     * @return array<string, array{0: \Closure(): mixed, 1: int}>
     */
    public static function hubErrors(): array
    {
        return [
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            'invalid address' => [fn () => Http::response(['error' => 'invalid_address'], 422), 422],
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            'refused' => [fn () => Http::response(['message' => 'No.'], 403), 422],
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            'rate limited' => [fn () => Http::response([], 429), 429],
            'unreachable' => [fn () => throw new \Illuminate\Http\Client\ConnectionException('down'), 502],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('hubErrors')]
    public function test_start_maps_hub_errors(\Closure $hub, int $status): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests' => $hub]);

        $this->signedIn()->postJson('/api/community/hub/start', ['admin_url' => self::ORIGIN])->assertStatus($status);
    }

    public function test_complete_with_a_wrong_state_is_422(): void
    {
        $this->fakeHub();
        $client = $this->signedIn();
        $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => 'bogus', 'result' => 'approved'])->assertStatus(422);
        $client->postJson('/api/community/hub/complete', ['state' => '', 'result' => 'approved'])->assertStatus(422);
    }

    public function test_a_denied_result_cancels_on_the_hub_and_the_state_is_single_use(): void
    {
        $this->fakeHub();
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'denied'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'denied');

        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/connect-requests/cancel'
            && $r->data() === ['device_code' => 'DEVICE-SECRET-CODE']);
        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])->assertStatus(422);
    }

    public function test_a_link_outside_the_configured_hub_is_refused(): void
    {
        foreach (['https://evil.example.net/connect/ABCD', 'javascript:alert(1)', self::HUB.'.evil.test/x'] as $link) {
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests' => Http::response([
                'device_code' => 'DEVICE-SECRET-CODE',
                'user_code' => 'ABCD-1234',
                'link' => $link,
                'expires_in' => 900,
            ], 201)]);

            $this->signedIn()->postJson('/api/community/hub/start', ['admin_url' => self::ORIGIN])
                ->assertStatus(502);
            $this->assertNull(session('community.hub_connect'));
        }
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/connect-requests/cancel')
            && $r['device_code'] === 'DEVICE-SECRET-CODE');
    }

    public function test_a_hub_url_outside_the_configured_hub_is_not_stored(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response([
            'server_id' => 'srv_1',
            'server_secret' => 'the-server-secret',
            'user' => self::APPROVER,
            'hub_url' => 'https://evil.example.net',
            'account' => ['name' => 'Acme'],
        ])]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])->assertOk();

        $this->assertSame(self::HUB, app(PanelSettings::class)->get('hub.hub_url'));
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), 'evil.example.net'));
    }

    public function test_a_hub_url_with_a_path_is_stored_as_its_origin(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response([
            'server_id' => 'srv_1',
            'server_secret' => 'the-server-secret',
            'user' => self::APPROVER,
            'hub_url' => self::HUB.'/app/',
            'account' => ['name' => 'Acme'],
        ])]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])->assertOk();

        $this->assertSame(self::HUB, app(PanelSettings::class)->get('hub.hub_url'));
        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/report');
    }

    public function test_an_approved_poll_stores_the_pairing_with_an_encrypted_secret(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response([
            'server_id' => 'srv_1',
            'server_secret' => 'the-server-secret',
            'user' => self::APPROVER,
            'hub_url' => self::HUB.'/',
            'account' => ['name' => 'Acme'],
        ])]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('status', 'connected')
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('reported', true)
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('paired', true)
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('account_name', 'Acme');

        $settings = app(PanelSettings::class);
        $this->assertSame('srv_1', $settings->get('hub.server_id'));
        $this->assertSame(self::HUB, $settings->get('hub.hub_url'));
        $this->assertSame(self::ORIGIN, $settings->get('hub.admin_url'));
        $this->assertSame('128', $settings->get('hub.user_id'));
        $stored = $settings->get('hub.server_secret');
        $this->assertNotSame('the-server-secret', $stored);
        $this->assertSame('the-server-secret', Crypt::decryptString($stored));
        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/report'
            && $r->hasHeader('X-Server-Id', 'srv_1'));
    }

    public function test_the_poll_backs_off_one_second_on_pending_and_three_on_slow_down(): void
    {
        $this->fakeHub();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        Http::fake([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::sequence()
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            ->push(['error' => 'authorization_pending'], 400)
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            ->push(['error' => 'slow_down'], 400)
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            ->push(['server_id' => 'srv_1', 'server_secret' => 'the-server-secret', 'hub_url' => self::HUB, 'user' => self::APPROVER])]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'connected');

        $this->assertSame([1.0, 3.0], $this->pauses);
    }

    public function test_expired_token_ends_the_poll_as_expired(): void
    {
        $this->fakeHub();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        Http::fake([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::sequence()
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            ->push(['error' => 'authorization_pending'], 400)
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            ->push(['error' => 'expired_token'], 400)]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'expired');

        $this->assertSame([1.0], $this->pauses);
        $this->assertNull(app(PanelSettings::class)->get('hub.server_id'));
    }

    public function test_access_denied_on_the_poll_is_denied_and_spends_the_state(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response(['error' => 'access_denied'], 400)]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'denied');
        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])->assertStatus(422);
    }

    public function test_a_return_after_the_code_expired_does_not_poll(): void
    {
        $this->fakeHub();
        $client = $this->signedIn();
        $state = $client->start();

        $this->travel(2000)->seconds();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'expired');
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/connect-requests/poll'));
    }

    public function test_an_incomplete_poll_answer_is_not_stored(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response(['server_id' => 'srv_1'])]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'expired');

        $this->assertNull(app(PanelSettings::class)->get('hub.server_id'));
    }

    public function test_the_device_code_is_encrypted_in_the_session(): void
    {
        $this->fakeHub();
        $client = $this->signedIn();
        $client->start();

        $stored = session('community.hub_connect');
        $this->assertIsString($stored);
        $this->assertStringNotContainsString('DEVICE-SECRET-CODE', $stored);
        $this->assertStringContainsString('DEVICE-SECRET-CODE', Crypt::decryptString($stored));
    }

    public function test_a_hub_error_while_polling_is_retried_and_the_state_survives_until_the_answer(): void
    {
        $this->fakeHub();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        Http::fake([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::sequence()
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            ->push('<html>bad gateway</html>', 502)
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            ->push(['server_id' => 'srv_1', 'server_secret' => 'the-server-secret', 'hub_url' => self::HUB, 'user' => self::APPROVER])]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'connected');

        $this->assertSame('srv_1', app(PanelSettings::class)->get('hub.server_id'));
        // Once the answer is final the state is spent.
        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])->assertStatus(422);
    }

    public function test_cancel_forgets_the_request_and_cancels_on_the_hub(): void
    {
        $this->fakeHub();
        $client = $this->signedIn();
        $state = $client->start();

        // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
        $client->postJson('/api/community/hub/cancel')->assertOk()->assertJsonPath('status', 'cancelled');

        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/connect-requests/cancel'));
        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])->assertStatus(422);
    }

    /**
     * Settings "Disconnect" (`HubConnection.vue`, `Setup.js:27`): the signed
     * `POST /api/panel/v1/disconnect` (PANEL-LOGIN-CONTRACT.md §4), then the
     * pairing goes, so `/home` hides "Sign in with PanelAlpha".
     */
    public function test_disconnect_tells_the_hub_and_forgets_the_pairing(): void
    {
        app(\PanelAlpha\Hub\HubPairing::class)->store('srv_1', 'server-secret-1', self::HUB, 'Acme', self::ORIGIN);
        Http::fake([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::HUB.'/api/panel/v1/disconnect' => Http::response([], 200),
        ]);

        $this->signedIn()
        // CA: packages/client-area/src/apis/Setup.js:27
            ->postJson('/api/community/hub/disconnect')
            ->assertOk()
        // CA reads: packages/client-area/src/views/free/HubConnection.vue:199-200 (paired, account_name)
            ->assertExactJson(['status' => 'disconnected', 'paired' => false, 'hub_url' => self::HUB, 'account_name' => null, 'connected_at' => null]);

        Http::assertSent(fn (Request $r) => $r->method() === 'POST'
            && $r->url() === self::HUB.'/api/panel/v1/disconnect'
            && $r->hasHeader('X-Server-Id', 'srv_1'));
        $this->assertFalse(app(\PanelAlpha\Hub\HubPairing::class)->isPaired());
        $this->assertNull(app(PanelSettings::class)->get('hub.server_secret'));
    }

    public function test_disconnect_forgets_the_pairing_when_the_hub_cannot_be_reached(): void
    {
        app(\PanelAlpha\Hub\HubPairing::class)->store('srv_1', 'server-secret-1', self::HUB, 'Acme', self::ORIGIN);
        Http::fake([
            // Defensive (not an Engine shape): the Hub is down
            self::HUB.'/api/panel/v1/disconnect' => fn () => throw new ConnectionException('Connection refused'),
        ]);

        $this->signedIn()
        // CA: packages/client-area/src/apis/Setup.js:27
            ->postJson('/api/community/hub/disconnect')
            ->assertOk()
        // CA reads: packages/client-area/src/views/free/HubConnection.vue:199-200 (paired)
            ->assertJsonPath('paired', false);

        $this->assertFalse(app(\PanelAlpha\Hub\HubPairing::class)->isPaired());
    }

    public function test_disconnect_of_an_unpaired_panel_calls_no_hub(): void
    {
        Http::fake();

        $this->signedIn()
        // CA: packages/client-area/src/apis/Setup.js:27
            ->postJson('/api/community/hub/disconnect')
            ->assertOk()
        // CA reads: packages/client-area/src/views/free/HubConnection.vue:199-200 (paired)
            ->assertJsonPath('status', 'disconnected');

        Http::assertNothingSent();
    }

    public function test_a_new_start_cancels_the_pending_request_on_the_hub(): void
    {
        $this->fakeHub();
        $client = $this->signedIn();
        $state = $client->start();
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/connect-requests/cancel'));

        $client->start();

        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/connect-requests/cancel')
            && $r['device_code'] === 'DEVICE-SECRET-CODE');
        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])->assertStatus(422);
    }

    public function test_no_log_record_contains_the_device_code_or_the_secret(): void
    {
        $records = [];
        Event::listen(MessageLogged::class, function (MessageLogged $e) use (&$records): void {
            $records[] = $e->message.json_encode($e->context);
        });
        // Control: the listener does see what is logged.
        Log::info('control');
        $this->assertCount(1, $records);

        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::sequence()
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            ->push('boom', 502)
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            ->push(['server_id' => 'srv_1', 'server_secret' => 'the-server-secret', 'hub_url' => self::HUB, 'user' => self::APPROVER])
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            ->push(['error' => 'access_denied'], 400)]);
        $client = $this->signedIn();

        // approved after a Hub error, then a denied return, then a Hub that cannot be reached
        $state = $client->start();
        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])->assertOk();
        $state = $client->start();
        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'denied'])->assertOk();
        Http::fake([self::HUB.'/*' => fn () => throw new ConnectionException('down DEVICE-SECRET-CODE')]);
        $client->postJson('/api/community/hub/start', ['admin_url' => self::ORIGIN])->assertStatus(502);

        // The Hub failures are logged (class only), and the transport message is not.
        $this->assertNotEmpty(array_filter($records, fn (string $r) => str_contains($r, 'ConnectionException')));
        foreach ($records as $record) {
            $this->assertStringNotContainsString('DEVICE-SECRET-CODE', $record);
            $this->assertStringNotContainsString('the-server-secret', $record);
        }
    }

    private function guest(): static
    {
        return $this->withHeader('Origin', self::ORIGIN);
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function approved(array $extra = []): array
    {
        return $extra + [
            'server_id' => 'srv_1',
            'server_secret' => 'the-server-secret',
            'hub_url' => self::HUB,
            'account' => ['name' => 'Acme'],
            'approved_by' => 'a***@example.com',
            'user' => ['id' => 128, 'email' => 'Ada@Example.com', 'name' => 'Ada Lovelace'],
        ];
    }

    private function guestStart(): string
    {
        // CA: packages/client-area/src/apis/Setup.js:16
        $link = $this->guest()->postJson('/api/community/hub/start', ['admin_url' => self::ORIGIN, 'server_name' => 'My panel'])
            ->assertOk()->json('link');
        parse_str((string) parse_url($link, PHP_URL_QUERY), $query);

        return $query['state'];
    }

    private function assertNothingPersisted(): void
    {
        $this->assertDatabaseCount('users', 0);
        $this->assertNull(app(PanelSettings::class)->get('hub.server_id'));
        $this->assertNull(app(PanelSettings::class)->get('hub.server_secret'));
        $this->assertNull(app(PanelSettings::class)->get('userapp.name'));
    }

    public function test_a_guest_start_without_a_server_name_is_422_while_the_setup_is_required(): void
    {
        $this->fakeHub();

        // CA: packages/client-area/src/apis/Setup.js:16
        $this->guest()->postJson('/api/community/hub/start', ['admin_url' => self::ORIGIN])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:236 (the validation errors)
            ->assertStatus(422)->assertJsonValidationErrors('server_name');
        Http::assertNothingSent();
    }

    public function test_a_guest_completes_the_setup_through_connect(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response($this->approved())]);
        $state = $this->guestStart();

        // CA: packages/client-area/src/apis/Setup.js:21
        $this->guest()->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('status', 'connected')
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('setup_completed', true)
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('reported', true)
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('paired', true)
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('account_name', 'Acme');

        $user = User::query()->firstOrFail();
        $this->assertSame('ada@example.com', $user->email);
        $this->assertSame('Ada Lovelace', $user->name);
        $this->assertSame('Ada', $user->first_name);
        $this->assertSame('Lovelace', $user->last_name);
        $this->assertTrue((bool) $user->password_generated);
        $this->assertSame('My panel', app(PanelSettings::class)->get('userapp.name'));
        $this->assertSame('srv_1', app(PanelSettings::class)->get('hub.server_id'));
        $this->assertSame(self::ORIGIN, app(PanelSettings::class)->get('hub.admin_url'));
        $this->assertSame('128', app(PanelSettings::class)->get('hub.user_id'));
        $this->assertAuthenticatedAs($user);
        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/report'
            && $r->hasHeader('X-Server-Id', 'srv_1'));
    }

    /**
     * @return array<string, array{array<string, mixed>}>
     */
    public static function answersWithoutAUser(): array
    {
        return [
            'user without an email' => [['user' => ['id' => 128, 'name' => 'Ada']]],
            // A ticket's `sub` must match the pairing, so a user without an id cannot sign in.
            'user without an id' => [['user' => ['email' => 'ada@example.com', 'name' => 'Ada']]],
            'user with a string id' => [['user' => ['id' => '128', 'email' => 'ada@example.com', 'name' => 'Ada']]],
            'user with an invalid email' => [['user' => ['id' => 128, 'email' => 'ada', 'name' => 'Ada']]],
            // An impersonated Hub session or a deleted Hub account (contract 1.4).
            'user null' => [['user' => null]],
            // An older Hub; the panel never read the masked approved_by, nor an `approver` the Hub never sent.
            'no user key' => [['user' => self::ABSENT, 'approver' => ['email' => 'ada@example.com']]],
            'user not an object' => [['user' => 'ada@example.com']],
        ];
    }

    /**
     * @param  array<string, mixed>  $answer
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('answersWithoutAUser')]
    public function test_an_approval_without_the_users_email_is_unsupported_and_cancelled(array $answer): void
    {
        $body = array_filter($this->approved($answer), static fn (mixed $value): bool => $value !== self::ABSENT);
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response($body)]);
        $state = $this->guestStart();

        // CA: packages/client-area/src/apis/Setup.js:21
        $this->guest()->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'unsupported');

        $this->assertNothingPersisted();
        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/connect-requests/cancel'
            && $r->data() === ['device_code' => 'DEVICE-SECRET-CODE']);
        Http::assertNotSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/report');
    }

    /**
     * Hub sign-in takes only the approver's tickets, so a Settings connect
     * whose answer names no Hub user (an impersonated Hub session) pairs
     * nothing and closes the approval on the Hub.
     *
     * @param  array<string, mixed>  $answer
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('answersWithoutAUser')]
    public function test_a_settings_connect_without_the_approving_user_pairs_nothing(array $answer): void
    {
        $body = array_filter($this->approved($answer), static fn (mixed $value): bool => $value !== self::ABSENT);
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response($body)]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'unsupported');

        $this->assertNull(app(PanelSettings::class)->get('hub.server_id'));
        $this->assertNull(app(PanelSettings::class)->get('hub.server_secret'));
        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/connect-requests/cancel'
            && $r->data() === ['device_code' => 'DEVICE-SECRET-CODE']);
        Http::assertNotSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/report');
    }

    public function test_a_401_on_the_first_report_rolls_the_whole_setup_back(): void
    {
        $this->fakeHub([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response($this->approved()),
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::HUB.'/api/panel/v1/report' => Http::response(['error' => 'unknown_server'], 401),
        ]);
        $state = $this->guestStart();

        // CA: packages/client-area/src/apis/Setup.js:21
        $this->guest()->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'expired');

        $this->assertNothingPersisted();
        $this->assertGuest();
    }

    public function test_a_5xx_on_the_first_report_keeps_the_setup_with_reported_false(): void
    {
        $this->fakeHub([
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response($this->approved()),
            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            self::HUB.'/api/panel/v1/report' => Http::response([], 503),
        ]);
        $state = $this->guestStart();

        // CA: packages/client-area/src/apis/Setup.js:21
        $this->guest()->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('status', 'connected')
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('reported', false)
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertJsonPath('paired', true);

        $this->assertDatabaseCount('users', 1);
        $this->assertAuthenticatedAs(User::query()->firstOrFail());
    }

    public function test_a_local_setup_that_won_the_race_answers_409_and_cancels_the_request(): void
    {
        // The poll is where the other submit lands: after the guest passed the route check.
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => function () {
            User::factory()->create();

            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            return Http::response($this->approved());
        }]);
        $state = $this->guestStart();

        // CA: packages/client-area/src/apis/Setup.js:21
        $this->guest()->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            ->assertStatus(409);

        $this->assertDatabaseCount('users', 1);
        $this->assertNull(app(PanelSettings::class)->get('hub.server_id'));
        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/connect-requests/cancel');
        Http::assertNotSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/report');
    }

    public function test_a_transport_error_while_polling_is_retried_and_the_connection_completes(): void
    {
        $this->fakeHub();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $polls = 0;
        // Defensive (not an Engine shape): the Hub is unreachable on the first poll, then answers
        Http::fake([self::HUB.'/api/panel/v1/connect-requests/poll' => function () use (&$polls) {
            if (++$polls === 1) {
                throw new ConnectionException('hub unreachable');
            }

            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            return Http::response(['server_id' => 'srv_1', 'server_secret' => 'the-server-secret', 'hub_url' => self::HUB, 'user' => self::APPROVER]);
        }]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'connected');

        $this->assertSame('srv_1', app(PanelSettings::class)->get('hub.server_id'));
        $this->assertSame([1.0], $this->pauses);
    }

    public function test_an_unreachable_hub_on_cancel_does_not_hide_the_409_of_a_setup_that_won_the_race(): void
    {
        $this->fakeHub([
            self::HUB.'/api/panel/v1/connect-requests/poll' => function () {
                User::factory()->create();

                // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
                return Http::response($this->approved());
            },
            // Defensive (not an Engine shape): the Hub is unreachable when the panel cancels
            self::HUB.'/api/panel/v1/connect-requests/cancel' => fn () => throw new ConnectionException('hub unreachable'),
        ]);
        $state = $this->guestStart();

        $this->guest()->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            ->assertStatus(409);

        $this->assertNull(app(PanelSettings::class)->get('hub.server_id'));
    }

    public function test_a_pending_record_that_cannot_be_decrypted_is_a_422_and_polls_nothing(): void
    {
        $this->fakeHub();

        $this->withSession(['community.hub_connect' => 'not-an-encrypted-payload'])
            ->signedIn()
            ->postJson('/api/community/hub/complete', ['state' => 'anything', 'result' => 'approved'])
            ->assertStatus(422);

        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/connect-requests/poll'));
    }

    public function test_a_guest_after_the_setup_is_done_gets_401(): void
    {
        $this->fakeHub();
        User::factory()->create();

        // CA: packages/client-area/src/apis/Setup.js:16
        $this->guest()->postJson('/api/community/hub/start', ['admin_url' => self::ORIGIN, 'server_name' => 'My panel'])->assertUnauthorized();
        Http::assertNothingSent();
    }

    public function test_a_signed_in_user_pairs_from_settings_as_before(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response($this->approved())]);
        $client = $this->signedIn();
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'connected')->assertJsonMissingPath('setup_completed');

        $this->assertDatabaseCount('users', 1);
        $this->assertSame('srv_1', app(PanelSettings::class)->get('hub.server_id'));
    }

    public function test_a_guest_whose_hub_user_has_no_name_gets_the_part_before_the_at(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response($this->approved(['user' => ['id' => 128, 'email' => ' Jane.Doe@Acme.test ', 'name' => '']]))]);
        $state = $this->guestStart();

        // CA: packages/client-area/src/apis/Setup.js:21
        $this->guest()->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('setup_completed', true);

        $user = User::query()->firstOrFail();
        $this->assertSame('jane.doe@acme.test', $user->email);
        $this->assertSame('jane.doe', $user->name);
        $this->assertNull($user->first_name);
        $this->assertNull($user->last_name);
    }

    /**
     * Community holds one user: a Hub user with another email who connects the panel
     * from Settings adds no second one, and the panel's user is left as it was
     * (the Hub's brief would add an admin; hub-connect-contract §3).
     */
    public function test_a_settings_connect_by_another_hub_user_creates_no_user_and_changes_nothing(): void
    {
        Log::spy();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response($this->approved(['user' => ['id' => 9, 'email' => 'other@acme.test', 'name' => 'Other']]))]);
        $client = $this->signedIn();
        $before = User::query()->firstOrFail()->only(['email', 'name', 'password']);
        $state = $client->start();

        $client->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:244 (status, setup_completed)
            ->assertOk()->assertJsonPath('status', 'connected');

        $this->assertDatabaseCount('users', 1);
        $this->assertSame($before, User::query()->firstOrFail()->only(['email', 'name', 'password']));
        Log::shouldHaveReceived('info')->with('Connected to PanelAlpha', ['by' => 'other@acme.test'])->once();
    }

    public function test_a_guest_cannot_disconnect_even_while_the_setup_is_required(): void
    {
        // CA: packages/client-area/src/apis/Setup.js:27
        $this->guest()->postJson('/api/community/hub/disconnect')->assertUnauthorized();
    }

    public function test_an_admin_with_a_generated_password_cannot_disconnect(): void
    {
        app(\PanelAlpha\Hub\HubPairing::class)->store('srv_1', 'server-secret-1', self::HUB, 'Acme', self::ORIGIN);
        Http::fake();
        $user = User::factory()->create();
        $user->password_generated = true;
        $user->save();

        $this->actingAs($user)->withHeader('Origin', self::ORIGIN)
            // CA: packages/client-area/src/apis/Setup.js:27
            ->postJson('/api/community/hub/disconnect')
            // CA reads: packages/client-area/src/views/free/HubConnection.vue:129-131 (the error message)
            ->assertStatus(409)->assertJsonPath('message', 'Set a password in My account before disconnecting.');

        $this->assertTrue(app(\PanelAlpha\Hub\HubPairing::class)->isPaired());
        Http::assertNothingSent();
    }

    public function test_a_guest_cannot_choose_the_return_address(): void
    {
        $this->fakeHub();

        $this->guest()->postJson('/api/community/hub/start', ['admin_url' => 'https://evil.example', 'server_name' => 'My panel'])
            ->assertOk();

        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/connect-requests'
            && $r['panel']['admin_url'] === self::ORIGIN);
    }

    public function test_a_failure_in_the_setup_transaction_cancels_on_the_hub_and_keeps_nothing(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response($this->approved())]);
        $this->app->instance(FirstUserCreator::class, new class implements FirstUserCreator
        {
            public function create(string $email, string $password, ?string $name): Authenticatable
            {
                throw new \RuntimeException('database is down');
            }

            public function createWithGeneratedPassword(string $email, ?string $name = null): Authenticatable
            {
                throw new \RuntimeException('database is down');
            }
        });
        $state = $this->guestStart();

        // CA: packages/client-area/src/apis/Setup.js:22
        $this->guest()->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:260-270 (`data.status`: anything but connected is shown as the failure)
            ->assertOk()->assertJsonPath('status', 'expired');

        $this->assertNothingPersisted();
        $this->assertGuest();
        $this->assertFalse(app(\PanelAlpha\Hub\HubPairing::class)->isPaired());
        Http::assertSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/connect-requests/cancel'
            && $r->data() === ['device_code' => 'DEVICE-SECRET-CODE']);
        Http::assertNotSent(fn (Request $r) => $r->url() === self::HUB.'/api/panel/v1/report');
    }

    public function test_a_second_complete_while_one_is_polling_is_a_409_with_the_confirming_code(): void
    {
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => Http::response($this->approved())]);
        $state = $this->guestStart();
        // The first return of this session still holds the poll lock (a second tab or a double click).
        $held = \Mockery::mock(\Illuminate\Contracts\Cache\Lock::class);
        $held->shouldReceive('get')->once()->andReturn(false);
        Cache::partialMock()->shouldReceive('lock')
            ->with(\Mockery::pattern('/^community:hub-complete:/'), \Mockery::any())->andReturn($held);

        // CA: packages/client-area/src/apis/Setup.js:22
        $this->guest()->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:273 (a 409 with `code === "confirming"` keeps the state for a retry)
            ->assertStatus(409)->assertJsonPath('code', 'confirming');

        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/connect-requests/poll'));
        $this->assertNothingPersisted();
    }

    public function test_the_setup_being_done_elsewhere_has_no_confirming_code(): void
    {
        $this->fakeHub([self::HUB.'/api/panel/v1/connect-requests/poll' => function () {
            User::factory()->create();

            // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
            return Http::response($this->approved());
        }]);
        $state = $this->guestStart();

        $this->guest()->postJson('/api/community/hub/complete', ['state' => $state, 'result' => 'approved'])
            ->assertStatus(409)->assertJsonMissingPath('code');
    }

    public function test_a_guest_status_and_cancel_are_401_after_the_setup_is_done(): void
    {
        $this->fakeHub();
        User::factory()->create();

        $this->guest()->getJson('/api/community/hub')->assertUnauthorized();
        $this->guest()->postJson('/api/community/hub/cancel')->assertUnauthorized();
        Http::assertNothingSent();
    }

    public function test_a_guest_start_is_throttled_tighter_than_a_signed_in_user(): void
    {
        $this->fakeHub();
        for ($i = 0; $i < 5; $i++) {
            $this->guest()->postJson('/api/community/hub/start', ['server_name' => 'My panel'])->assertOk();
        }

        $this->guest()->postJson('/api/community/hub/start', ['server_name' => 'My panel'])->assertStatus(429);
    }
}
