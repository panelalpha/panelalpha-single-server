<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\Hub\HubLoginTicket;
use PanelAlpha\Hub\HubPairing;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * "Sign in with PanelAlpha" on the Community panel (Hub login is kept
 * for Free and Pro, not Multi; a ticket login skips 2FA).
 *
 * Contract (PANEL-LOGIN-CONTRACT.md 2.1-2.3, old `HubLoginController`,
 * packages/api/app/Http/Controllers/HubLoginController.php:25-91, routes
 * `user.hub_login_start` / `user.login_from_hub`, `throttle:hub-login`):
 * - CA: the login page shows the button when `/home` `app.hub_login`
 *   (`Login.vue:547-548`), `GET /hub-login/start` answers `{url}` it goes to
 *   (`Auth.js:235-240`); the Hub sends the browser to `/hub-login#ticket=…`
 *   and the CA posts `POST /hub-login {ticket}` (`Auth.js:223-231`), any 2xx is
 *   signed in, a failure shows the page's "invalid" text (`HubLogin.vue:30,69`).
 * - The ticket: HS256 JWT over `{iss: hub_url, aud: server_id, sub: <Hub user id>,
 *   email, name, jti, iat, exp, state?}` with the pairing's server_secret.
 */
final class HubLoginTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const HUB = 'https://hub.test';

    private const SECRET = 'the-server-secret';

    /** The CA's origin: Sanctum gives a stateful (session) request to it. */
    private const ORIGIN = 'http://localhost';

    protected function setUp(): void
    {
        parent::setUp();
        config(['hub.url' => self::HUB]);
    }

    private function pair(): void
    {
        app(HubPairing::class)->store('srv_1', self::SECRET, self::HUB, 'Acme', 'https://panel.example.com', '128');
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function ticket(array $claims = [], string $secret = self::SECRET): string
    {
        $encode = static fn (string $value): string => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
        $header = $encode((string) json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $body = $encode((string) json_encode($claims + [
            'iss' => self::HUB,
            'aud' => 'srv_1',
            'sub' => '128',
            'iat' => time(),
            'exp' => time() + 60,
            'jti' => 'jti-'.bin2hex(random_bytes(8)),
            'email' => 'owner@acme.test',
            'name' => 'Owner',
        ]));

        return $header.'.'.$body.'.'.$encode(hash_hmac('sha256', $header.'.'.$body, $secret, true));
    }

    public function test_home_offers_the_hub_login_only_while_paired(): void
    {
        User::factory()->create();

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        $unpaired = $this->getJson('/api/home')->assertOk();
        // CA reads: packages/client-area/src/views/Login.vue:548 (app.hub_login)
        $unpaired->assertJsonPath('app.hub_login', false);

        $this->pair();
        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        $paired = $this->getJson('/api/home')->assertOk();
        // CA reads: packages/client-area/src/views/Login.vue:548 (app.hub_login)
        $paired->assertJsonPath('app.hub_login', true);
    }

    public function test_home_reports_the_hub_pairing_for_the_menu_reminder(): void
    {
        // The reminder is a signed-in menu's, so a guest never gets the flag.
        $this->actingAs(User::factory()->create());

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        $unpaired = $this->getJson('/api/home')->assertOk();
        // CA reads: packages/client-area/src/components/navbar/UserInfoDropdown.vue:208 (app.hub_paired)
        $unpaired->assertJsonPath('app.hub_paired', false);

        $this->pair();
        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        $paired = $this->getJson('/api/home')->assertOk();
        // CA reads: packages/client-area/src/components/navbar/UserInfoDropdown.vue:208 (app.hub_paired)
        $paired->assertJsonPath('app.hub_paired', true);

        app(HubPairing::class)->forget();
        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        $forgotten = $this->getJson('/api/home')->assertOk();
        // CA reads: packages/client-area/src/components/navbar/UserInfoDropdown.vue:208 (app.hub_paired)
        $forgotten->assertJsonPath('app.hub_paired', false);
    }

    public function test_start_keeps_a_state_and_answers_the_hub_url(): void
    {
        User::factory()->create();

        // CA: packages/client-area/src/apis/Auth.js:238 (Api.get('/hub-login/start'))
        $this->withHeader('Origin', self::ORIGIN)->getJson('/api/hub-login/start')->assertNotFound();

        $this->pair();
        // CA: packages/client-area/src/apis/Auth.js:238 (Api.get('/hub-login/start'))
        $response = $this->withHeader('Origin', self::ORIGIN)->getJson('/api/hub-login/start?provider=google')->assertOk();
        // CA reads: packages/client-area/src/apis/Auth.js:239 (response.data.url)
        $url = (string) $response->json('url');

        $this->assertStringStartsWith(self::HUB.'/panel-login?', $url);
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $this->assertSame('srv_1', $query['panel']);
        $this->assertSame('google', $query['provider']);
        $this->assertSame(32, strlen((string) $query['state']));
    }

    public function test_a_valid_ticket_signs_in_the_only_user_once_and_logs_it(): void
    {
        $user = User::factory()->create();
        $this->pair();
        $ticket = $this->ticket();

        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $response = $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $ticket]);
        // CA reads: packages/client-area/src/apis/Auth.js:229-231 (any 2xx: signed in)
        $response->assertOk()->assertExactJson(['success' => true]);
        $this->assertAuthenticatedAs($user);

        $log = DB::table('activity_logs')->where('action', 'user.login_from_hub')->first();
        $this->assertNotNull($log);
        $this->assertSame($user->id, $log->user_id);
        $this->assertSame(['PanelAlpha' => ['email' => 'owner@acme.test', 'name' => 'Owner']], json_decode((string) $log->payload, true));

        auth()->guard()->logout();
        // The ticket is single use.
        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $again = $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $ticket]);
        // CA reads: packages/client-area/src/views/HubLogin.vue:30 (the invalid-link page)
        $again->assertStatus(422)->assertJsonPath('message', 'This login link is not valid any more. Log in again from PanelAlpha.');
    }

    /**
     * "Open in panel" on one app of the Hub's panel page: the ticket names the
     * app by the `id` the report gives it (`target.app`, contract §8), and the
     * answer names that project's page. An id the panel does not know, or
     * anything but a plain id, lands on the dashboard as before.
     */
    public function test_a_ticket_for_one_app_answers_its_page_and_anything_else_the_dashboard(): void
    {
        User::factory()->create();
        $this->pair();
        $app = Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'shop',
            'domain' => 'shop.example.com',
            'status' => 'active',
        ]);

        $answers = [];
        foreach ([(string) $app->id, (string) ($app->id + 1), '../settings', $app->id, '0'.$app->id] as $target) {
            auth()->guard()->logout();
            // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
            $response = $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $this->ticket(['target' => ['app' => $target]])]);
            // CA reads: packages/client-area/src/apis/Auth.js:229-231 (any 2xx: signed in; `redirect` is new, read by the v1 Client Area's HubLoginView)
            $response->assertOk();
            $answers[] = $response->json();
        }

        $this->assertSame([
            ['success' => true, 'redirect' => '/projects/'.$app->id],
            ['success' => true],
            ['success' => true],
            ['success' => true],
            ['success' => true],
        ], $answers);
    }

    /**
     * The Hub's sign-in is the check, so a user
     * with two-factor authentication gets no challenge.
     */
    public function test_a_user_with_two_factor_signs_in_without_a_challenge(): void
    {
        $user = User::factory()->create();
        $user->forceFill(['two_factor_secret' => encrypt('secret'), 'two_factor_confirmed_at' => now()])->save();
        $this->pair();

        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $response = $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $this->ticket()]);
        // CA reads: packages/client-area/src/apis/Auth.js:229-231 (any 2xx: signed in)
        $response->assertOk()->assertJsonMissingPath('two_factor');
        $this->assertAuthenticatedAs($user);
    }

    /**
     * A ticket signs in the panel's only user, so only the Hub user who
     * connected the panel may: a team member or a support session the Hub
     * would issue a ticket for is refused.
     */
    public function test_only_the_hub_user_who_connected_the_panel_signs_in(): void
    {
        $user = User::factory()->create();
        $this->pair();

        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $other = $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $this->ticket(['sub' => '129'])]);
        // CA reads: packages/client-area/src/views/HubLogin.vue:30 (the invalid-link page)
        $other->assertStatus(422)->assertJsonPath('message', 'This login link is not valid any more. Log in again from PanelAlpha.');
        $this->assertGuest();

        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $this->ticket(['sub' => '128'])])->assertOk();
        $this->assertAuthenticatedAs($user);
    }

    public function test_a_pairing_that_names_no_hub_user_offers_no_hub_login(): void
    {
        User::factory()->create();
        app(HubPairing::class)->store('srv_1', self::SECRET, self::HUB, 'Acme', 'https://panel.example.com');

        // CA: packages/client-area/src/apis/Auth.js:50 (`Api.cached(...).get('/home')`)
        // CA reads: packages/client-area/src/views/Login.vue:548 (app.hub_login)
        $this->getJson('/api/home')->assertOk()->assertJsonPath('app.hub_login', false);
        // CA: packages/client-area/src/apis/Auth.js:238 (Api.get('/hub-login/start'))
        $this->withHeader('Origin', self::ORIGIN)->getJson('/api/hub-login/start')->assertNotFound();
        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $this->ticket()])->assertStatus(422);
        $this->assertGuest();
    }

    /**
     * The Hub's sign-in skips the panel's 2FA, so it does not count as a
     * password confirmation: the 2FA secret, the recovery codes and turning
     * 2FA off stay behind the password.
     */
    public function test_a_hub_login_cannot_read_or_change_two_factor(): void
    {
        $user = User::factory()->create();
        $user->forceFill(['two_factor_secret' => encrypt('secret'), 'two_factor_confirmed_at' => now()])->save();
        $this->pair();

        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $this->ticket()])->assertOk();

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:218 (`Api.get('/user/two-factor-secret-key')`)
        $this->withHeader('Origin', self::ORIGIN)->getJson('/api/user/two-factor-secret-key')->assertStatus(423);
        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:46 (`Api.delete('/user/two-factor-authentication')`)
        $this->withHeader('Origin', self::ORIGIN)->deleteJson('/api/user/two-factor-authentication')->assertStatus(423);
        $this->assertNotNull($user->fresh()->two_factor_confirmed_at);
    }

    public function test_a_panel_started_login_needs_its_own_state(): void
    {
        $user = User::factory()->create();
        $this->pair();
        // CA: packages/client-area/src/apis/Auth.js:238 (Api.get('/hub-login/start'))
        $url = (string) $this->withHeader('Origin', self::ORIGIN)->getJson('/api/hub-login/start')->json('url');
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $wrong = $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $this->ticket(['state' => 'another-state-value-123'])]);
        // CA reads: packages/client-area/src/views/HubLogin.vue:30 (the invalid-link page)
        $wrong->assertStatus(422);
        $this->assertGuest();

        // The state is single use: a new start, then the matching ticket.
        // CA: packages/client-area/src/apis/Auth.js:238 (Api.get('/hub-login/start'))
        $url = (string) $this->withHeader('Origin', self::ORIGIN)->getJson('/api/hub-login/start')->json('url');
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $right = $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $this->ticket(['state' => (string) $query['state']])]);
        // CA reads: packages/client-area/src/apis/Auth.js:229-231 (any 2xx: signed in)
        $right->assertOk();
        $this->assertAuthenticatedAs($user);
    }

    /**
     * @return array<string, array{\Closure(self): string}>
     */
    public static function badTickets(): array
    {
        return [
            'malformed' => [fn (self $t): string => 'not-a-ticket'],
            'other secret' => [fn (self $t): string => $t->ticket([], 'another-secret')],
            'expired' => [fn (self $t): string => $t->ticket(['exp' => time() - 120])],
            'issued in the future' => [fn (self $t): string => $t->ticket(['iat' => time() + 600])],
            'other panel' => [fn (self $t): string => $t->ticket(['aud' => 'srv_2'])],
            'other issuer' => [fn (self $t): string => $t->ticket(['iss' => 'https://evil.test'])],
            'no subject' => [fn (self $t): string => $t->ticket(['sub' => ''])],
            'a number as subject' => [fn (self $t): string => $t->ticket(['sub' => 128])],
            'no email' => [fn (self $t): string => $t->ticket(['email' => null])],
            'not an email' => [fn (self $t): string => $t->ticket(['email' => 'owner'])],
            // The Hub's ticket before 2026-10-28.
            'the old main_admin ticket' => [fn (self $t): string => $t->ticket(['sub' => 'main_admin', 'email' => null, 'by' => ['email' => 'owner@acme.test']])],
            'state without a session state' => [fn (self $t): string => $t->ticket(['state' => 'abc'])],
            'short jti' => [fn (self $t): string => $t->ticket(['jti' => 'short'])],
        ];
    }

    /**
     * @param  \Closure(self): string  $ticket
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('badTickets')]
    public function test_a_bad_ticket_is_refused_with_the_same_422(\Closure $ticket): void
    {
        User::factory()->create();
        $this->pair();

        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $response = $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $ticket($this)]);
        // CA reads: packages/client-area/src/views/HubLogin.vue:30 (the invalid-link page)
        $response->assertStatus(422)->assertExactJson(['message' => 'This login link is not valid any more. Log in again from PanelAlpha.']);
        $this->assertGuest();
    }

    public function test_an_unpaired_or_multi_user_panel_refuses_every_ticket(): void
    {
        User::factory()->create();
        $ticket = $this->ticket();

        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $unpaired = $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $ticket]);
        // CA reads: packages/client-area/src/views/HubLogin.vue:30 (the invalid-link page)
        $unpaired->assertStatus(422);

        $this->pair();
        $this->bindMultiUserEdition([]);
        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $multi = $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $this->ticket()]);
        // CA reads: packages/client-area/src/views/HubLogin.vue:30 (the invalid-link page)
        $multi->assertStatus(422);
        $this->assertGuest();
    }

    public function test_the_old_hub_login_limiter_is_30_a_minute(): void
    {
        User::factory()->create();
        foreach (range(1, 30) as $ignored) {
            // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
            $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => 'x'])->assertStatus(422);
        }
        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => 'x'])->assertStatus(429);
        $this->assertSame(300, HubLoginTicket::JTI_TTL);
        $this->assertSame(30, HubLoginTicket::CLOCK_TOLERANCE);
    }

    /**
     * "Disconnect from PanelAlpha" (contract §4), an operator command: the
     * signed disconnect, then the pairing is forgotten and tickets are refused.
     */
    public function test_disconnect_tells_the_hub_and_forgets_the_pairing(): void
    {
        User::factory()->create();
        $this->pair();
        // Defensive (not an Engine shape): a PanelAlpha Hub reply, see hub/docs/hub-connect-contract.md
        Http::fake([self::HUB.'/api/panel/v1/disconnect' => Http::response(['ok' => true])]);

        $this->artisan('hub:disconnect')->expectsOutput('Disconnected from PanelAlpha.')->assertSuccessful();

        Http::assertSent(function (Request $r): bool {
            $canonical = implode("\n", ['POST', 'api/panel/v1/disconnect', $r->header('X-Timestamp')[0], hash('sha256', $r->body())]);

            return $r->url() === self::HUB.'/api/panel/v1/disconnect'
                && $r->header('X-Server-Id')[0] === 'srv_1'
                && hash_equals(hash_hmac('sha256', $canonical, self::SECRET), $r->header('X-Signature')[0]);
        });
        $this->assertFalse(app(HubPairing::class)->isPaired());

        // CA: packages/client-area/src/apis/Auth.js:229 (Api.post('/hub-login', { ticket }))
        $refused = $this->withHeader('Origin', self::ORIGIN)->postJson('/api/hub-login', ['ticket' => $this->ticket()]);
        // CA reads: packages/client-area/src/views/HubLogin.vue:30 (the invalid-link page)
        $refused->assertStatus(422);

        $this->artisan('hub:disconnect')->expectsOutput('Not connected to PanelAlpha.')->assertSuccessful();
    }

    public function test_disconnect_forgets_the_pairing_when_the_hub_is_down(): void
    {
        User::factory()->create();
        $this->pair();
        // Defensive (not an Engine shape): an unreachable PanelAlpha Hub, see hub/docs/hub-connect-contract.md
        Http::fake([self::HUB.'/*' => fn () => throw new \Illuminate\Http\Client\ConnectionException('down')]);

        $this->artisan('hub:disconnect')->assertSuccessful();

        $this->assertFalse(app(HubPairing::class)->isPaired());
    }
}
