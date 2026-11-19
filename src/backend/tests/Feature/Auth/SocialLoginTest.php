<?php

namespace Tests\Feature\Auth;

use App\Models\Setting;
use App\Models\User;
use App\Services\Auth\SocialLoginService;
use App\Support\SocialProviders;
use Illuminate\Contracts\Auth\StatefulGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\AbstractProvider;
use Laravel\Socialite\Two\User as SocialiteTwoUser;
use Mockery;
use PanelAlpha\ClientArea\Contracts\SocialLoginCredentials;
use PHPUnit\Framework\Attributes\DataProvider;
use PragmaRX\Google2FA\Google2FA;
use RuntimeException;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Social login. Community is single-user, so the callback never registers a
 * user and never starts a trial – and a provider identity signs in only the
 * user whose stored `social_auth.<provider>_id` it matches (or, on a first
 * link, whose provider-verified email equals the panel user's).
 *
 * CA:
 *  - `GET /auth/{provider}/redirect-url` from the login page; reads
 *    `response.data.data.url` (packages/client-area/src/views/Login.vue:757,759).
 *  - `POST /auth/{provider}/callback` forwards the query string and treats the
 *    successful response as the /home payload (packages/client-area/src/apis/Auth.js:152,154);
 *    an `account_already_exists` body routes back to /login
 *    (packages/client-area/src/views/SocialLogin.vue:58).
 *  - `/home` drives the buttons through `app.integrations.auth`
 *    (packages/client-area/src/views/Login.vue:544).
 *
 * Old: packages/api/routes/api.php:96-97,
 * packages/api/app/Http/Controllers/AuthController.php:1129-1242,
 * packages/api/app/Lib/Integrations/Auth/AbstractAuth.php:50-85.
 */
class SocialLoginTest extends TestCase
{
    use RefreshDatabase;

    private function enableProvider(string $provider): void
    {
        $driver = SocialProviders::driver($provider);
        config()->set("services.{$driver}.client_id", 'client-id');
        config()->set("services.{$driver}.client_secret", 'client-secret');
    }

    /**
     * Mock the Socialite stateless provider chain: the service always passes the
     * SPA callback URL to `redirectUrl()`, so a wrong callback fails the test.
     */
    private function fakeSocialite(string $provider, SocialiteUser $remote, string $target = 'https://provider.example/authorize', ?string $origin = null): void
    {
        $providerMock = Mockery::mock(AbstractProvider::class);
        $providerMock->shouldReceive('redirectUrl')
            ->with(($origin ?? config('app.url')).'/auth/'.$provider.'/callback')
            ->andReturnSelf();
        $providerMock->shouldReceive('stateless')->andReturnSelf();
        $providerMock->shouldReceive('user')->andReturn($remote);
        $redirect = Mockery::mock(RedirectResponse::class);
        $redirect->shouldReceive('getTargetUrl')->andReturn($target);
        $providerMock->shouldReceive('redirect')->andReturn($redirect);

        Socialite::shouldReceive('driver')->with(SocialProviders::driver($provider))->andReturn($providerMock);
    }

    /**
     * A real Socialite user object, so `vouchesForEmail()` can read the raw
     * verified-email flag the providers set (`Two/GoogleProvider.php:91`,
     * `Two/LinkedInOpenIdProvider.php:80`).
     *
     * @param  array<string, mixed>  $raw
     */
    private function remoteUser(string $id, string $email, array $raw = []): SocialiteUser
    {
        return (new SocialiteTwoUser())
            ->map([
                'id' => $id,
                'name' => 'Social User',
                'email' => $email,
                'nickname' => 'social',
                'avatar' => null,
            ])
            ->setRaw(array_merge(['id' => $id, 'email' => $email], $raw));
    }

    /** The old `account_already_exists` 422 the CA keys on (SocialLogin.vue:58). */
    private function assertAccountExists(\Illuminate\Testing\TestResponse $response): void
    {
        $response->assertStatus(422)
            // CA reads: packages/client-area/src/views/SocialLogin.vue:58 (`error_type === "account_already_exists"`)
            ->assertJsonPath('error_type', 'account_already_exists')
            // CA reads: packages/client-area/src/apis/Api.js:77 (numeric keys show the message alone)
            ->assertJsonPath('errors.0.0', 'Account Already Exists');
    }

    public function test_redirect_url_returns_the_socialite_url(): void
    {
        $this->enableProvider('google');
        $this->fakeSocialite('google', $this->remoteUser('1', 'a@example.com'), 'https://accounts.google.com/o/oauth2/auth?x=1');

        // CA: packages/client-area/src/views/Login.vue:757
        $response = $this->getJson('/api/auth/google/redirect-url');

        // CA reads: packages/client-area/src/views/Login.vue:759
        $response->assertOk()->assertJsonPath('data.url', 'https://accounts.google.com/o/oauth2/auth?x=1');
    }

    public function test_redirect_url_uses_the_stored_panel_url_for_the_callback(): void
    {
        Setting::set('userapp.url', 'https://new.example.com:8443');
        $this->enableProvider('google');
        $this->fakeSocialite('google', $this->remoteUser('1', 'a@example.com'), 'https://accounts.google.com/o/oauth2/auth?x=1', 'https://new.example.com:8443');

        // CA: packages/client-area/src/views/Login.vue:757
        $response = $this->getJson('/api/auth/google/redirect-url');

        // CA reads: packages/client-area/src/views/Login.vue:759
        $response->assertOk()->assertJsonPath('data.url', 'https://accounts.google.com/o/oauth2/auth?x=1');
    }

    public function test_redirect_url_builds_the_real_provider_from_config(): void
    {
        $this->enableProvider('google');

        // No Socialite mock here: the driver is built from config/services.php,
        // which must carry the `redirect` key Socialite requires
        // (vendor/laravel/socialite/src/SocialiteManager.php:242).
        // CA: packages/client-area/src/views/Login.vue:757
        $response = $this->getJson('/api/auth/google/redirect-url');

        // CA reads: packages/client-area/src/views/Login.vue:759
        $response->assertOk();
        $url = $response->json('data.url');
        $this->assertIsString($url);
        $this->assertStringStartsWith('https://accounts.google.com/', $url);
        $this->assertStringContainsString('redirect_uri=', $url);
    }

    public function test_redirect_url_is_404_for_an_unconfigured_provider(): void
    {
        // CA: packages/client-area/src/views/Login.vue:757
        $this->getJson('/api/auth/google/redirect-url')->assertNotFound();
    }

    public function test_callback_signs_in_the_stored_provider_id_only(): void
    {
        // The provider email differs from the panel user's: the stored id, not
        // the email, is what signs the user in.
        $user = User::factory()->create([
            'email' => 'panel@example.com',
            'social_auth' => ['github_id' => '987', 'github_user' => ['id' => '987']],
        ]);
        $this->enableProvider('github');
        $this->fakeSocialite('github', $this->remoteUser('987', 'social@example.com'));

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/github/callback');

        // CA reads: packages/client-area/src/apis/Auth.js:154
        $response->assertOk()->assertJsonPath('user.email', 'panel@example.com');
        $this->assertAuthenticatedAs($user);
    }

    public function test_callback_refuses_a_foreign_provider_id(): void
    {
        User::factory()->create([
            'email' => 'panel@example.com',
            'social_auth' => ['github_id' => 'stored-1', 'github_user' => ['id' => 'stored-1']],
        ]);
        $this->enableProvider('github');
        $this->fakeSocialite('github', $this->remoteUser('other-2', 'panel@example.com'));

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/github/callback');

        $this->assertAccountExists($response);
        $this->assertGuest();
    }

    public function test_callback_refuses_an_empty_provider_id(): void
    {
        User::factory()->create(['email' => 'panel@example.com']);
        $this->enableProvider('google');
        // The provider answers without an id: there is nothing to match or
        // store.
        $this->fakeSocialite('google', $this->remoteUser('', 'panel@example.com', ['verified_email' => true]));

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/google/callback');

        $this->assertAccountExists($response);
        $this->assertGuest();
    }

    public function test_callback_refuses_an_unlinked_identity_with_a_different_email(): void
    {
        User::factory()->create(['email' => 'panel@example.com']);
        $this->enableProvider('google');
        $this->fakeSocialite('google', $this->remoteUser('1', 'other@example.com', ['verified_email' => true]));

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/google/callback');

        $this->assertAccountExists($response);
        $this->assertGuest();
        $this->assertSame(1, User::query()->count());
    }

    public function test_callback_refuses_an_unverified_email(): void
    {
        User::factory()->create(['email' => 'panel@example.com']);
        $this->enableProvider('google');
        $this->fakeSocialite('google', $this->remoteUser('1', 'panel@example.com', ['verified_email' => false]));

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/google/callback');

        $this->assertAccountExists($response);
        $this->assertGuest();
    }

    public function test_callback_refuses_a_provider_without_a_verified_email_signal(): void
    {
        User::factory()->create(['email' => 'panel@example.com']);
        $this->enableProvider('facebook');
        // Facebook's raw `verified` flags the account, not the address, so the
        // first link must be refused even with an equal email.
        $this->fakeSocialite('facebook', $this->remoteUser('1', 'panel@example.com', ['verified' => true]));

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/facebook/callback');

        $this->assertAccountExists($response);
        $this->assertGuest();
    }

    public function test_callback_links_a_verified_equal_email_and_stores_the_id(): void
    {
        $user = User::factory()->create(['email' => 'panel@example.com']);
        $this->enableProvider('linkedin');
        // Case-insensitive comparison plus the provider's vouch: the CA's
        // `linkedin` slug uses Socialite's OpenID driver, whose raw payload
        // carries the `email_verified` signal
        // (vendor/laravel/socialite/src/Two/LinkedInOpenIdProvider.php:80).
        $this->fakeSocialite('linkedin', $this->remoteUser('77', 'PANEL@example.com', ['email_verified' => true]));

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/linkedin/callback');

        // CA reads: packages/client-area/src/apis/Auth.js:154
        $response->assertOk()->assertJsonPath('user.email', 'panel@example.com');
        $this->assertAuthenticatedAs($user);

        $user->refresh();
        $this->assertSame('77', $user->social_auth['linkedin_id'] ?? null);
    }

    public function test_redirect_url_builds_the_real_linkedin_openid_provider_from_config(): void
    {
        $this->enableProvider('linkedin');

        // No Socialite mock here: the driver is built from services.linkedin-openid
        // and must be the OpenID driver (linkedin.com/oauth/v2/authorization),
        // not the legacy one.
        // CA: packages/client-area/src/views/Login.vue:757
        $response = $this->getJson('/api/auth/linkedin/redirect-url');

        // CA reads: packages/client-area/src/views/Login.vue:759
        $response->assertOk();
        $url = $response->json('data.url');
        $this->assertIsString($url);
        $this->assertStringStartsWith('https://www.linkedin.com/oauth/v2/authorization', $url);

        // The OpenID driver asks for the OIDC scopes and returns to the CA's
        // callback, not the API (Laravel Socialite's default OAuth2 scopes would
        // be r_liteprofile/r_emailaddress and a wrong redirect would strand the
        // browser).
        $query = [];
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $this->assertSame('openid profile email', $query['scope'] ?? null);
        $this->assertSame('http://localhost/auth/linkedin/callback', $query['redirect_uri'] ?? null);
    }

    /**
     * A LinkedIn first link needs the OpenID driver's verified-email signal:
     * a missing flag, an explicit `false` and a truthy string are all refused.
     *
     * @return array<string, array{array<string, mixed>}>
     */
    public static function linkedinEmailVouches(): array
    {
        return [
            'no flag' => [[]],
            'false' => [['email_verified' => false]],
            'string true' => [['email_verified' => 'true']],
        ];
    }

    /**
     * @param  array<string, mixed>  $raw
     */
    #[DataProvider('linkedinEmailVouches')]
    public function test_callback_refuses_a_linkedin_email_without_a_verified_flag(array $raw): void
    {
        $user = User::factory()->create(['email' => 'panel@example.com']);
        $this->enableProvider('linkedin');
        $this->fakeSocialite('linkedin', $this->remoteUser('77', 'panel@example.com', $raw));

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/linkedin/callback');

        $this->assertAccountExists($response);
        $this->assertGuest();
        $user->refresh();
        $this->assertNull($user->social_auth['linkedin_id'] ?? null);
    }

    public function test_callback_keeps_other_providers_social_auth_keys(): void
    {
        $user = User::factory()->create([
            'email' => 'panel@example.com',
            'social_auth' => ['google_id' => 'g-1', 'google_user' => ['id' => 'g-1']],
        ]);
        $this->enableProvider('github');
        $this->fakeSocialite('github', $this->remoteUser('987', 'panel@example.com'));

        // CA: packages/client-area/src/apis/Auth.js:152
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/github/callback')
            ->assertOk();

        $user->refresh();
        $this->assertSame('g-1', $user->social_auth['google_id'] ?? null);
        $this->assertSame('987', $user->social_auth['github_id'] ?? null);
    }

    public function test_callback_refuses_a_two_factor_user_with_the_password_hint(): void
    {
        User::factory()->create([
            'email' => 'panel@example.com',
            'social_auth' => ['github_id' => '987', 'github_user' => ['id' => '987']],
            'two_factor_secret' => encrypt(app(Google2FA::class)->generateSecretKey()),
            'two_factor_confirmed_at' => now(),
        ]);
        $this->enableProvider('github');
        $this->fakeSocialite('github', $this->remoteUser('987', 'panel@example.com'));

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/github/callback');

        // The unchanged CA cannot finish a 2FA challenge
        // after a provider login, so a 2FA user is refused with the old-style
        // key-0 422; the old `{two_factor:true}` answer must be gone.
        // CA reads: packages/client-area/src/apis/Api.js:77 (numeric keys show the message alone)
        $response->assertStatus(422)
            ->assertJsonPath('errors.0.0', 'Two-factor authentication is enabled – sign in with your password.')
            ->assertJsonMissingPath('two_factor');
    }

    public function test_callback_starts_no_session_for_a_two_factor_user(): void
    {
        User::factory()->create([
            'email' => 'panel@example.com',
            'social_auth' => ['github_id' => '987', 'github_user' => ['id' => '987']],
            'two_factor_secret' => encrypt(app(Google2FA::class)->generateSecretKey()),
            'two_factor_confirmed_at' => now(),
        ]);
        $this->enableProvider('github');
        $this->fakeSocialite('github', $this->remoteUser('987', 'panel@example.com'));

        // CA: packages/client-area/src/apis/Auth.js:152
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/github/callback')
            ->assertStatus(422);

        // No session and no `login.id` stash (the removed challenge branch).
        $this->assertGuest();
        $this->assertNull(session('login.id'));
    }

    public function test_callback_does_not_link_a_two_factor_user(): void
    {
        $user = User::factory()->create([
            'email' => 'panel@example.com',
            'two_factor_secret' => encrypt(app(Google2FA::class)->generateSecretKey()),
            'two_factor_confirmed_at' => now(),
        ]);
        $this->enableProvider('google');
        $this->fakeSocialite('google', $this->remoteUser('1', 'panel@example.com', ['verified_email' => true]));

        // CA: packages/client-area/src/apis/Auth.js:152
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/google/callback')
            ->assertStatus(422);

        // A refused 2FA login changes no `social_auth`
        // key, not even the first-link `<provider>_id`.
        $user->refresh();
        $this->assertNull($user->social_auth['google_id'] ?? null);
        $this->assertNull($user->social_auth['google_user'] ?? null);
    }

    public function test_callback_regenerates_the_session_on_a_successful_login(): void
    {
        User::factory()->create([
            'email' => 'panel@example.com',
            'social_auth' => ['github_id' => '987', 'github_user' => ['id' => '987']],
        ]);
        $this->enableProvider('github');
        $this->fakeSocialite('github', $this->remoteUser('987', 'panel@example.com'));

        // The web SessionGuard rotates the id inside login() as well, so a
        // mocked guard isolates the service's own regenerate().
        $guard = Mockery::mock(StatefulGuard::class);
        $guard->shouldReceive('login')->once();
        $this->app->instance(StatefulGuard::class, $guard);

        $session = app('session')->driver();
        $session->setId(str_repeat('a', 40));
        $session->start();
        $before = $session->getId();

        $request = Request::create('/api/auth/github/callback', 'POST');
        $request->setLaravelSession($session);
        $this->app->instance('request', $request);
        $this->app->instance(Request::class, $request);

        app(SocialLoginService::class)->callback('github', $request);

        $this->assertNotSame($before, $session->getId());
    }

    public function test_callback_persists_a_first_link_only_after_the_session_check(): void
    {
        $user = User::factory()->create(['email' => 'panel@example.com']);
        $this->enableProvider('google');
        $this->fakeSocialite('google', $this->remoteUser('1', 'panel@example.com', ['verified_email' => true]));

        // The login/session step fails: the first link must not have been
        // persisted before it.
        $guard = Mockery::mock(StatefulGuard::class);
        $guard->shouldReceive('login')->once()->andThrow(new RuntimeException('session store down'));
        $this->app->instance(StatefulGuard::class, $guard);

        $session = app('session')->driver();
        $session->start();
        $request = Request::create('/api/auth/google/callback', 'POST');
        $request->setLaravelSession($session);
        $this->app->instance('request', $request);
        $this->app->instance(Request::class, $request);

        try {
            app(SocialLoginService::class)->callback('google', $request);
            $this->fail('Expected the login failure to bubble.');
        } catch (RuntimeException) {
            // expected
        }

        $user->refresh();
        $this->assertNull($user->social_auth['google_id'] ?? null);
        $this->assertNull($user->social_auth['google_user'] ?? null);
    }

    public function test_callback_logs_the_old_activity_action(): void
    {
        // The old panel's LogRequests wrote the route name as the activity
        // action; the CA translates `user.social_auth_handle_callback`
        // (packages/api/routes/api.php:97).
        User::factory()->create([
            'email' => 'panel@example.com',
            'social_auth' => ['github_id' => '987', 'github_user' => ['id' => '987']],
        ]);
        $this->enableProvider('github');
        $this->fakeSocialite('github', $this->remoteUser('987', 'panel@example.com'));

        // CA: packages/client-area/src/apis/Auth.js:152
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/github/callback')
            ->assertOk();

        $this->assertDatabaseHas('activity_logs', ['action' => 'user.social_auth_handle_callback']);
    }

    public function test_callback_never_registers_a_second_user(): void
    {
        User::factory()->create(['email' => 'panel@example.com']);
        $this->enableProvider('facebook');
        $this->fakeSocialite('facebook', $this->remoteUser('5', 'other@example.com'));

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/facebook/callback');

        $this->assertAccountExists($response);
        $this->assertSame(1, User::query()->count());
    }

    public function test_callback_is_404_when_no_panel_user_exists(): void
    {
        $this->enableProvider('github');
        $this->fakeSocialite('github', $this->remoteUser('1', 'a@example.com'));

        // CA: packages/client-area/src/apis/Auth.js:152
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/github/callback')
            ->assertNotFound();
    }

    public function test_home_lists_only_configured_providers(): void
    {
        $this->enableProvider('linkedin');

        // CA: packages/client-area/src/apis/Auth.js:50
        $response = $this->getJson('/api/home');

        // CA reads: packages/client-area/src/views/Login.vue:544
        $response->assertOk()->assertJsonPath('app.integrations.auth', ['linkedin']);
    }

    /**
     * A paid edition keeps the credentials in the panel (the Admin Area's auth
     * integrations, `SocialLoginCredentials`): they are preferred over the
     * environment and build the driver without changing the config.
     */
    public function test_credentials_kept_by_the_panel_are_preferred_over_the_environment(): void
    {
        config()->set('services.github.client_id', 'env-id');
        config()->set('services.github.client_secret', 'env-secret');
        $this->app->instance(SocialLoginCredentials::class, new class implements SocialLoginCredentials
        {
            public function for(string $provider): ?array
            {
                return $provider === 'google' ? ['client_id' => 'panel-id', 'client_secret' => 'panel-secret'] : null;
            }
        });

        // CA: packages/client-area/src/apis/Auth.js:50
        $response = $this->getJson('/api/home');
        // CA reads: packages/client-area/src/views/Login.vue:544
        $response->assertOk()->assertJsonPath('app.integrations.auth', ['google', 'github']);

        // No Socialite mock: the real driver is built from the panel's client.
        // CA: packages/client-area/src/views/Login.vue:757
        $response = $this->getJson('/api/auth/google/redirect-url');
        // CA reads: packages/client-area/src/views/Login.vue:759
        $response->assertOk();
        $this->assertStringContainsString('client_id=panel-id', (string) $response->json('data.url'));
        $this->assertNull(config('services.google.client_id'));
        $this->assertSame(['client_id' => 'env-id', 'client_secret' => 'env-secret'], SocialProviders::credentials('github'));
    }

    public function test_community_keeps_no_social_credentials_of_its_own(): void
    {
        $this->assertNull(app(SocialLoginCredentials::class)->for('google'));
        $this->assertNull(SocialProviders::credentials('google'));
    }

    public function test_callback_is_404_for_an_unconfigured_provider(): void
    {
        // CA: packages/client-area/src/apis/Auth.js:152
        $this->postJson('/api/auth/google/callback')->assertNotFound();
    }

    public function test_callback_maps_a_provider_failure_to_a_validation_error(): void
    {
        $this->enableProvider('google');

        $providerMock = Mockery::mock(AbstractProvider::class);
        $providerMock->shouldReceive('redirectUrl')->andReturnSelf();
        $providerMock->shouldReceive('stateless')->andReturnSelf();
        $providerMock->shouldReceive('user')->andThrow(new RuntimeException('denied'));
        Socialite::shouldReceive('driver')->with('google')->andReturn($providerMock);

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/auth/google/callback');

        // CA reads: packages/client-area/src/apis/Api.js:77 (numeric error keys show the message alone)
        $response->assertStatus(422)
            ->assertJsonPath('errors.0.0', 'Something went wrong. Please try again later.');
    }
}
