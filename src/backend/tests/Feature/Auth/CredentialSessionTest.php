<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PragmaRX\Google2FA\Google2FA;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * Architecture §4.4 "Session actions per endpoint": the session id
 * is compared **inside one carried session** (the test client does not keep
 * cookies between requests, so each change request carries the warmup session's
 * cookie). Removing the `regenerate()` makes these tests fail.
 * @see packages/api/routes/api.php:126,135 (old /login, /logout)
 * @see Architecture §4.4 "Session actions per endpoint"
 */
class CredentialSessionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Make the test origin stateful and persist sessions, so the session id
        // can be read back from the `sessions` table.
        config(['sanctum.stateful' => [TestNetwork::LOOPBACK.':9080']]);
        config(['session.driver' => 'database']);
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080');
        // JSON requests only send cookies when credentials are enabled (the CA
        // sends axios withCredentials: true), so the carried session cookie
        // reaches the server – otherwise these tests silently start a new session.
        $this->withCredentials();
    }

    private function otherSession(User $user, string $id): void
    {
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $user->id,
            'ip_address' => TestNetwork::public(10),
            'user_agent' => 'OtherBrowser/1.0',
            'payload' => base64_encode(serialize([])),
            'last_activity' => now()->timestamp,
        ]);
    }

    /**
     * The session row created by a warmup request, plus its cookie.
     *
     * @return array{id: string, cookie: string}
     */
    private function warmup(User $user): array
    {
        // CA: packages/client-area/src/views/Account.vue:496 (`Api.get('/home')`)
        $response = $this->actingAs($user)->getJson('/api/home');
        // The wire cookie value (encrypted); `getCookie()` returns it decrypted.
        $cookie = collect($response->headers->getCookies())
            ->first(fn ($c) => $c->getName() === config('session.cookie'))
            ->getValue();

        return [
            'id' => (string) DB::table('sessions')->where('user_id', $user->id)->orderByDesc('last_activity')->value('id'),
            'cookie' => $cookie,
        ];
    }

    /**
     * A guest session started by the SPA's csrf-cookie call; the login request
     * carries its cookie so the id change is observable.
     *
     * @return array{id: string, cookie: string}
     */
    private function warmupGuest(): array
    {
        // CA: packages/client-area/src/apis/Auth.js:315 (`Api.get('/csrf-cookie')`)
        $response = $this->getJson('/api/csrf-cookie')->assertNoContent();

        return [
            'id' => session()->getId(),
            'cookie' => collect($response->headers->getCookies())
                ->first(fn ($c) => $c->getName() === config('session.cookie'))
                ->getValue(),
        ];
    }

    public function test_password_change_regenerates_the_session_and_rotates_the_token(): void
    {
        $user = User::factory()->create([
            'password' => 'Old-Password1!',
            'remember_token' => 'old-remember-token',
        ]);
        $this->otherSession($user, str_repeat('b', 40));
        $session = $this->warmup($user);

        // CA: packages/client-area/src/mixins/ChangePasswordMixin.js:91 (`Api.put('/user/password', formData)`)
        $response = $this->withUnencryptedCookie(config('session.cookie'), $session['cookie'])
            ->actingAs($user)->putJson('/api/user/password', [
                'current_password' => 'Old-Password1!',
                'password' => 'New-Password1!',
                'password_confirmation' => 'New-Password1!',
            ]);
        $response->assertOk();

        // The other session row is gone and the carried session got a new id
        // (removing regenerate() leaves the session id and the old row -> this
        // fails). Compare state in one carried session, never cookie values –
        // encrypted cookies always differ.
        $this->assertDatabaseMissing('sessions', ['id' => str_repeat('b', 40)]);
        $this->assertDatabaseMissing('sessions', ['id' => $session['id']]);
        $this->assertNotSame($session['id'], session()->getId());
        $this->assertNotSame('old-remember-token', $user->fresh()->remember_token);
    }

    public function test_login_regenerates_the_session(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        $warmup = $this->warmupGuest();

        // The carried cookie resumes the warmup session (no regeneration on a read).
        // CA: packages/client-area/src/apis/Auth.js:315
        $this->withUnencryptedCookie(config('session.cookie'), $warmup['cookie'])
            ->getJson('/api/csrf-cookie')->assertNoContent();
        $this->assertSame($warmup['id'], session()->getId());

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        $this->withUnencryptedCookie(config('session.cookie'), $warmup['cookie'])
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', [
                'email' => 'user@example.com',
                'password' => 'password123',
            ])
            ->assertOk();

        $this->assertAuthenticated();
        // Removing session()->regenerate() in LoginService keeps the carried id.
        $this->assertNotSame($warmup['id'], session()->getId());
    }

    public function test_login_service_regenerates_the_session_itself(): void
    {
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        // The web SessionGuard rotates the id inside login() as well
        // (SessionGuard::updateSession(), framework line 604-608), so the HTTP
        // test above cannot isolate LoginService's own regenerate(). Mock the
        // guard out: without the service line the id would not change.
        $guard = \Mockery::mock(\Illuminate\Contracts\Auth\StatefulGuard::class);
        $guard->shouldReceive('login')->once();

        $session = app('session')->driver();
        $session->setId(str_repeat('a', 40));
        $session->start();
        $before = $session->getId();

        $request = \Illuminate\Http\Request::create('/api/login', 'POST');
        $request->setLaravelSession($session);

        (new \App\Services\Auth\LoginService(
            $guard,
            app(\App\Services\Account\DeviceService::class),
            app(\PanelAlpha\ClientArea\Contracts\LoginPasswordSetup::class),
        ))->attempt($request, 'user@example.com', 'password123', false);

        $this->assertNotSame($before, $session->getId());
    }

    /**
     * One carried session: the action runs against a request that has a real
     * session store, so the id change is observable and removing `regenerate()`
     * makes this fail.
     */
    public function test_password_change_regenerates_the_session_in_one_session(): void
    {
        $user = User::factory()->create(['password' => 'Old-Password1!']);

        $session = app('session')->driver();
        $session->setId(str_repeat('a', 40));
        $session->start();
        $before = $session->getId();

        $request = \Illuminate\Http\Request::create('/api/user/password', 'PUT');
        $request->setLaravelSession($session);
        $this->app->instance('request', $request);
        $this->app->instance(\Illuminate\Http\Request::class, $request);

        (new \App\Actions\Fortify\UpdateUserPassword())->update($user, [
            'current_password' => 'Old-Password1!',
            'password' => 'New-Password1!',
            'password_confirmation' => 'New-Password1!',
        ]);

        $this->assertNotSame($before, $session->getId());
    }

    public function test_password_reset_ends_the_users_sessions(): void
    {
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'Old-Password1!',
            'remember_token' => 'old-remember-token',
        ]);
        $this->otherSession($user, str_repeat('c', 40));

        $token = \Illuminate\Support\Facades\Password::broker()->createToken($user);

        // CA: packages/client-area/src/views/ResetPassword.vue:109 (`Api.post('/reset-password', …)`)
        $this->postJson('/api/reset-password', [
            'token' => $token,
            'email' => 'user@example.com',
            'password' => 'New-Password1!',
            'password_confirmation' => 'New-Password1!',
        ])->assertOk();

        $this->assertDatabaseMissing('sessions', ['id' => str_repeat('c', 40)]);
        $this->assertNotSame('old-remember-token', $user->fresh()->remember_token);
    }

    private function warmupCarry(array $session, User $user): void
    {
        // CA: packages/client-area/src/views/Account.vue:496 (`Api.get('/home')`)
        $this->withUnencryptedCookie(config('session.cookie'), $session['cookie'])
            ->actingAs($user)->getJson('/api/home')->assertOk();
        $this->assertSame($session['id'], session()->getId());
    }

    /**
     * The 2FA routes need a recent password confirmation: the
     * carried session gets one, as a password login gives it.
     */
    private function confirmPassword(): void
    {
        session()->put('auth.password_confirmed_at', time());
        session()->save();
    }

    public function test_enabling_two_factor_regenerates_the_session(): void
    {
        $user = User::factory()->create();
        $session = $this->warmup($user);
        $this->warmupCarry($session, $user);
        $this->confirmPassword();

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:213
        $response = $this->withUnencryptedCookie(config('session.cookie'), $session['cookie'])
            ->actingAs($user)->postJson('/api/user/two-factor-authentication');
        $response->assertOk();

        $this->assertNotNull($user->fresh()->two_factor_secret);
        $this->assertNotSame($session['id'], session()->getId());
    }

    public function test_confirming_two_factor_regenerates_the_session(): void
    {
        $user = User::factory()->create();
        $secret = app(Google2FA::class)->generateSecretKey();
        $user->forceFill(['two_factor_secret' => encrypt($secret)])->save();

        $session = $this->warmup($user);
        $this->warmupCarry($session, $user);
        $this->confirmPassword();

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:166
        $response = $this->withUnencryptedCookie(config('session.cookie'), $session['cookie'])
            ->actingAs($user)->postJson('/api/user/confirmed-two-factor-authentication', [
                'code' => app(Google2FA::class)->getCurrentOtp($secret),
            ]);
        $response->assertOk();

        $this->assertNotNull($user->fresh()->two_factor_confirmed_at);
        $this->assertNotSame($session['id'], session()->getId());
    }

    public function test_disabling_two_factor_regenerates_the_session(): void
    {
        $user = User::factory()->create([
            'two_factor_secret' => encrypt(app(Google2FA::class)->generateSecretKey()),
            'two_factor_confirmed_at' => now(),
        ]);
        app(\Laravel\Fortify\Actions\GenerateNewRecoveryCodes::class)($user);

        $session = $this->warmup($user);
        $this->warmupCarry($session, $user);
        $this->confirmPassword();

        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:46
        $response = $this->withUnencryptedCookie(config('session.cookie'), $session['cookie'])
            ->actingAs($user)->deleteJson('/api/user/two-factor-authentication');
        $response->assertOk();

        $this->assertNull($user->fresh()->two_factor_secret);
        $this->assertNotSame($session['id'], session()->getId());
    }
}
