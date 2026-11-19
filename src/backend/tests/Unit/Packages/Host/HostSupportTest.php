<?php

namespace Tests\Unit\Packages\Host;

use App\Actions\Fortify\Concerns\RefreshesAuthenticationSessions;
use App\Http\Controllers\Controller;
use App\Http\Requests\Account\EmailUpdateRequest;
use App\Models\Device;
use App\Models\User;
use App\Services\Account\DeviceService;
use App\Services\Auth\LoginService;
use App\Services\Auth\SocialLoginService;
use App\Services\Language\TranslationRepository;
use App\Support\EngineRunningTasks;
use App\Support\EngineSystemInfo;
use App\Support\HomePayload;
use App\Support\SocialProviders;
use App\Support\UserAgent;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Container\Container;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Foundation\Auth\User as FoundationUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\AbstractProvider;
use Laravel\Socialite\Two\User as SocialiteTwoUser;
use Mockery;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\SingleEngineResolver;
use RuntimeException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Small host classes the feature tests reach only on their main path: the
 * cached Engine facts without an Engine, the session refresh of a credential
 * change, the device list, the login and social edge cases.
 */
final class HostSupportTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    /** A resolver for a panel whose Engine connection is not set up yet. */
    private function unconfiguredEngine(): void
    {
        $this->app->forgetInstance(EngineConnection::class);
        $this->app->bind(EngineResolver::class, fn () => new SingleEngineResolver(new Container));
    }

    // ---- EngineSystemInfo, EngineRunningTasks ------------------------------

    public function test_system_info_is_empty_and_calls_nothing_while_no_engine_is_configured(): void
    {
        $this->unconfiguredEngine();
        Http::fake();
        $info = new EngineSystemInfo(app(EngineResolver::class));

        $info->refresh();

        $this->assertSame([], $info->get());
        $this->assertSame([], $info->ipv4Addresses());
        $this->assertNull($info->sitesBaseDomain());
        Http::assertNothingSent();
    }

    public function test_running_tasks_is_false_and_calls_nothing_while_no_engine_is_configured(): void
    {
        $this->unconfiguredEngine();
        Http::fake();
        $tasks = new EngineRunningTasks(app(EngineResolver::class));

        $tasks->refresh();

        $this->assertFalse($tasks->get());
        Http::assertNothingSent();
    }

    public function test_the_ipv4_addresses_are_the_default_one_then_every_public_nat_address_once(): void
    {
        $this->configureEngine();
        Cache::forever('host:engine-system-info:1', ['fetched_at' => time(), 'info' => [
            'default_ipv4' => TestNetwork::public(7),
            'ipv4_nat_maps' => [
                ['public' => TestNetwork::public(8), 'private' => TestNetwork::private(8)],
                ['public_ip' => TestNetwork::public(9)],
                ['public' => TestNetwork::public(7)],
                ['public' => ''],
                ['private' => TestNetwork::private(9)],
                'junk',
            ],
        ]]);

        $this->assertSame(
            [TestNetwork::public(7), TestNetwork::public(8), TestNetwork::public(9)],
            (new EngineSystemInfo(app(EngineResolver::class)))->ipv4Addresses(),
        );
    }

    public function test_the_sites_base_domain_is_null_when_blank(): void
    {
        $this->configureEngine();
        $info = new EngineSystemInfo(app(EngineResolver::class));

        Cache::forever('host:engine-system-info:1', ['fetched_at' => time(), 'info' => ['sites_base_domain' => '']]);
        $this->assertNull($info->sitesBaseDomain());

        Cache::forever('host:engine-system-info:1', ['fetched_at' => time(), 'info' => ['sites_base_domain' => 'sites.example.com']]);
        $this->assertSame('sites.example.com', $info->sitesBaseDomain());
    }

    // ---- RefreshesAuthenticationSessions -----------------------------------

    private function refresher(): object
    {
        return new class
        {
            use RefreshesAuthenticationSessions;

            public function run(mixed $user): void
            {
                $this->refreshAuthenticationSessions($user);
            }
        };
    }

    private function sessionRow(string $id, ?int $userId): void
    {
        DB::table('sessions')->insert(['id' => $id, 'user_id' => $userId, 'ip_address' => null, 'user_agent' => null, 'payload' => '', 'last_activity' => time()]);
    }

    public function test_a_session_refresh_for_something_that_is_not_a_panel_user_does_nothing(): void
    {
        $user = User::factory()->create();
        $this->sessionRow('s1', $user->id);

        $this->refresher()->run(new class implements Authenticatable
        {
            public function getAuthIdentifierName(): string
            {
                return 'id';
            }

            public function getAuthIdentifier(): mixed
            {
                return $this->getKey();
            }

            public function getKey(): int
            {
                return 1;
            }

            public function getAuthPasswordName(): string
            {
                return 'password';
            }

            public function getAuthPassword(): string
            {
                return '';
            }

            public function getRememberToken(): ?string
            {
                return null;
            }

            public function setRememberToken($value): void {}

            public function getRememberTokenName(): string
            {
                return 'remember_token';
            }
        });
        $this->refresher()->run(null);

        $this->assertDatabaseHas('sessions', ['id' => 's1']);
    }

    public function test_without_a_session_every_session_of_the_user_ends_and_the_remember_token_rotates(): void
    {
        $user = User::factory()->create(['remember_token' => 'old-token']);
        $other = User::factory()->create();
        $this->sessionRow('mine-1', $user->id);
        $this->sessionRow('mine-2', $user->id);
        $this->sessionRow('theirs', $other->id);
        $this->sessionRow('guest', null);

        $this->refresher()->run($user);

        $this->assertDatabaseMissing('sessions', ['id' => 'mine-1']);
        $this->assertDatabaseMissing('sessions', ['id' => 'mine-2']);
        $this->assertDatabaseHas('sessions', ['id' => 'theirs']);
        $this->assertDatabaseHas('sessions', ['id' => 'guest']);
        $token = $user->fresh()?->remember_token;
        $this->assertNotSame('old-token', $token);
        $this->assertSame(60, strlen((string) $token));
        $this->assertSame([], Cookie::getQueuedCookies());
    }

    public function test_with_a_session_the_current_one_is_regenerated_and_the_recaller_cookie_is_renewed(): void
    {
        $user = User::factory()->create();
        $this->sessionRow('another-device', $user->id);
        $store = $this->app['session.store'];
        $store->start();
        $oldId = $store->getId();
        $request = request();
        $request->setLaravelSession($store);
        $recaller = Auth::guard('web')->getRecallerName();
        $request->cookies->set($recaller, 'stale');

        $this->refresher()->run($user);

        $this->assertNotSame($oldId, $store->getId());
        $this->assertDatabaseMissing('sessions', ['id' => 'another-device']);
        $queued = Cookie::getQueuedCookies();
        $this->assertCount(1, $queued);
        $this->assertSame($recaller, $queued[0]->getName());
        $this->assertSame($user->id.'|'.$user->fresh()?->remember_token.'|'.$user->fresh()?->password, $queued[0]->getValue());
    }

    public function test_with_a_session_but_no_recaller_cookie_none_is_queued(): void
    {
        $user = User::factory()->create();
        $store = $this->app['session.store'];
        $store->start();
        request()->setLaravelSession($store);

        $this->refresher()->run($user);

        $this->assertSame([], Cookie::getQueuedCookies());
    }

    // ---- Controller, EmailUpdateRequest ------------------------------------

    public function test_a_controller_refuses_an_account_that_is_not_a_panel_user(): void
    {
        $controller = new class extends Controller
        {
            public function who(Request $request): User
            {
                return $this->authenticatedUser($request);
            }
        };
        $request = Request::create('/');
        $request->setUserResolver(fn () => new class extends FoundationUser {});

        $this->expectException(AuthenticationException::class);
        $controller->who($request);
    }

    public function test_a_controller_hands_back_the_panel_user(): void
    {
        $user = User::factory()->create();
        $controller = new class extends Controller
        {
            public function who(Request $request): User
            {
                return $this->authenticatedUser($request);
            }
        };
        $request = Request::create('/');
        $request->setUserResolver(fn () => $user);

        $this->assertTrue($user->is($controller->who($request)));
    }

    public function test_the_email_rule_skips_its_taken_check_for_a_value_that_is_not_text(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $validator = Validator::make(['email' => ['taken@example.com'], 'password' => 'x'], (new EmailUpdateRequest)->rules());

        $this->assertTrue($validator->fails());
        $this->assertArrayHasKey('email', $validator->errors()->toArray());
        $this->assertStringNotContainsString('taken', implode(' ', $validator->errors()->get('email')));
    }

    public function test_the_email_rule_refuses_an_address_of_another_user_in_any_letter_case(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $validator = Validator::make(['email' => 'TAKEN@example.com', 'password' => 'x'], (new EmailUpdateRequest)->rules());

        $this->assertTrue($validator->fails());
        $this->assertArrayHasKey('email', $validator->errors()->toArray());
    }

    // ---- TranslationRepository, HomePayload --------------------------------

    public function test_a_language_without_translation_files_is_refused(): void
    {
        $repository = app(TranslationRepository::class);

        foreach (['zz', 'xx-YY', 'a b'] as $lang) {
            try {
                $repository->forLanguage($lang);
                $this->fail("{$lang} must be refused");
            } catch (ValidationException $e) {
                $this->assertSame(['Invalid language'], $e->errors()[0]);
            }
        }
    }

    public function test_a_language_code_that_tries_to_leave_the_language_folder_is_refused(): void
    {
        try {
            app(TranslationRepository::class)->forLanguage('../../../composer');
            $this->fail('A path in the language code must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame(['Invalid language'], $e->errors()[0]);
        }
    }

    public function test_flags_are_given_only_for_languages_with_a_meta_file(): void
    {
        $this->assertSame([], HomePayload::languageFlags(['zz', 'qq']));
        $this->assertSame([], HomePayload::languageFlags([]));
    }

    // ---- SocialProviders ---------------------------------------------------

    public function test_a_provider_that_is_not_supported_is_never_enabled(): void
    {
        config(['services.microsoft.client_id' => 'id', 'services.microsoft.client_secret' => 'secret']);

        $this->assertFalse(SocialProviders::isEnabled('microsoft'));
        $this->assertFalse(SocialProviders::isEnabled(''));
        $this->assertFalse(SocialProviders::isEnabled('GOOGLE'));
        $this->assertSame('linkedin-openid', SocialProviders::driver('linkedin'));
        $this->assertSame('google', SocialProviders::driver('google'));
    }

    public function test_a_supported_provider_is_enabled_only_with_both_credentials(): void
    {
        config(['services.github.client_id' => 'id', 'services.github.client_secret' => null]);
        $this->assertFalse(SocialProviders::isEnabled('github'));

        config(['services.github.client_secret' => 'secret']);
        $this->assertTrue(SocialProviders::isEnabled('github'));
        $this->assertContains('github', SocialProviders::enabled());
    }

    public function test_a_provider_that_fails_to_build_a_redirect_is_a_generic_422_not_a_500(): void
    {
        config(['services.github.client_id' => 'id', 'services.github.client_secret' => 'secret']);
        Socialite::shouldReceive('driver')->andThrow(new RuntimeException('bad credentials for secret'));

        // CA: packages/client-area/src/views/Login.vue:757
        $response = $this->getJson('/api/auth/github/redirect-url');

        // CA reads: packages/client-area/src/views/Login.vue:759
        $response->assertStatus(422);
        $this->assertStringNotContainsString('bad credentials', (string) $response->getContent());
    }

    public function test_a_driver_that_is_not_oauth2_is_refused(): void
    {
        config(['services.github.client_id' => 'id', 'services.github.client_secret' => 'secret']);
        Socialite::shouldReceive('driver')->andReturn(Mockery::mock(Provider::class));

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('is not a Socialite OAuth2 provider');
        app(SocialLoginService::class)->redirectUrl('github');
    }

    public function test_a_first_link_by_a_provider_that_sends_no_email_is_refused(): void
    {
        User::factory()->create(['email' => 'owner@example.com']);
        config(['services.github.client_id' => 'id', 'services.github.client_secret' => 'secret']);
        $remote = (new SocialiteTwoUser)->map(['id' => '77', 'name' => 'Remote', 'email' => null, 'nickname' => null, 'avatar' => null])->setRaw(['id' => '77']);
        $provider = Mockery::mock(AbstractProvider::class);
        $provider->shouldReceive('redirectUrl')->andReturnSelf();
        $provider->shouldReceive('stateless')->andReturnSelf();
        $provider->shouldReceive('user')->andReturn($remote);
        Socialite::shouldReceive('driver')->andReturn($provider);

        // CA: packages/client-area/src/apis/Auth.js:152
        $response = $this->postJson('/api/auth/github/callback');

        // CA reads: packages/client-area/src/views/SocialLogin.vue:58 (`error_type === "account_already_exists"`)
        $response->assertStatus(422)->assertJsonPath('error_type', 'account_already_exists');
    }

    // ---- LoginService, DeviceService ---------------------------------------

    public function test_a_login_for_an_unknown_email_with_a_password_fails_like_a_wrong_password(): void
    {
        $request = Request::create('/api/login', 'POST');
        $request->setLaravelSession($this->app['session.store']);

        try {
            app(LoginService::class)->attempt($request, 'Nobody@Example.com', 'Some-Password1!', false);
            $this->fail('An unknown email must fail.');
        } catch (ValidationException $e) {
            $this->assertSame(['These credentials do not match our records.'], $e->errors()['email']);
        }
    }

    public function test_the_device_list_shows_a_remembered_device_without_a_live_session_after_the_live_ones(): void
    {
        $user = User::factory()->create();
        DB::table('sessions')->insert(['id' => 'live-1', 'user_id' => $user->id, 'ip_address' => TestNetwork::public(5), 'user_agent' => 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0', 'payload' => '', 'last_activity' => time()]);
        Device::query()->create(['authenticatable_type' => $user::class, 'authenticatable_id' => $user->id, 'ip_address' => TestNetwork::public(99), 'user_agent' => 'old', 'browser' => 'Safari', 'device' => 'Mac', 'detection' => true, 'last_login' => now()->subDay()]);

        $rows = app(DeviceService::class)->forUser($user, 'live-1');

        $this->assertCount(2, $rows);
        $this->assertSame('live-1', $rows[0]->sessionId);
        $this->assertTrue($rows[0]->current);
        $this->assertNull($rows[1]->sessionId);
        $this->assertFalse($rows[1]->current);
        $this->assertSame(TestNetwork::public(99), $rows[1]->ipAddress);
        $this->assertSame('Safari', $rows[1]->browser);
    }

    public function test_a_known_device_is_matched_to_its_live_session_and_not_listed_twice(): void
    {
        $user = User::factory()->create();
        $agent = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0';
        $parsed = UserAgent::parse($agent);
        DB::table('sessions')->insert(['id' => 'live-1', 'user_id' => $user->id, 'ip_address' => TestNetwork::public(5), 'user_agent' => $agent, 'payload' => '', 'last_activity' => time()]);
        $known = Device::query()->create(['authenticatable_type' => $user::class, 'authenticatable_id' => $user->id, 'ip_address' => TestNetwork::public(5), 'user_agent' => $agent, 'browser' => $parsed['browser'], 'device' => $parsed['device'], 'detection' => true, 'last_login' => now()->subDay()]);

        $rows = app(DeviceService::class)->forUser($user, 'live-1');

        $this->assertCount(1, $rows);
        $this->assertSame($known->id, $rows[0]->deviceId);
        $this->assertSame('live-1', $rows[0]->sessionId);
        $this->assertDatabaseCount('devices', 1);
        $this->assertTrue($known->authenticatable?->is($user));
    }
}
