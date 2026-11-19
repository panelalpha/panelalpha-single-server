<?php

namespace Tests\Feature\Auth;

use App\Http\Middleware\ConfirmPasswordWhenRequired;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use PragmaRX\Google2FA\Google2FA;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The password confirmation before two-factor changes.
 *
 * `auth.require_password_for_2fa` is on by default: the 2FA routes answer 423
 * until a password login, a 2FA challenge or `POST /user/confirm-password`
 * confirmed the session. Runs the same assertions with the flag on and off.
 * @see packages/api/routes/api.php:781-829 (old two-factor routes)
 */
class PasswordConfirmationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080');
    }

    public function test_password_confirmation_endpoints_require_authentication(): void
    {
        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:63 (`Api.post('/user/confirm-password', {password})`)
        $this->postJson('/api/user/confirm-password', ['password' => 'x'])->assertUnauthorized();
        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:197 (the CA's call is commented out; the route is kept)
        $this->getJson('/api/user/confirmed-password-status')->assertUnauthorized();
    }

    public function test_two_factor_endpoints_require_authentication(): void
    {
        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:213 (`Api.post('/user/two-factor-authentication')`)
        $this->postJson('/api/user/two-factor-authentication')->assertUnauthorized();
        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:215 (`Api.get('/user/two-factor-qr-code')`)
        $this->getJson('/api/user/two-factor-qr-code')->assertUnauthorized();
        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:218 (`Api.get('/user/two-factor-secret-key')`)
        $this->getJson('/api/user/two-factor-secret-key')->assertUnauthorized();
        // CA: packages/client-area/src/views/Login.vue:682 (`Api.get('/user/two-factor-recovery-codes')`)
        $this->getJson('/api/user/two-factor-recovery-codes')->assertUnauthorized();
    }

    public function test_all_seven_two_factor_routes_carry_the_gate(): void
    {
        $gated = [];
        foreach (\Illuminate\Support\Facades\Route::getRoutes() as $route) {
            foreach ($route->gatherMiddleware() as $middleware) {
                if (is_string($middleware) && str_starts_with($middleware, 'password.confirm.2fa')) {
                    $gated[] = $route->getName();
                }
            }
        }

        // One value, on every two-factor route.
        $this->assertEqualsCanonicalizing([
            'two-factor.enable',
            'two-factor.disable',
            'two-factor.confirm',
            'two-factor.qr-code',
            'two-factor.secret-key',
            'two-factor.recovery-codes',
            'two-factor.recovery-codes.store',
        ], $gated);
    }

    public function test_confirm_password_is_throttled(): void
    {
        $user = User::factory()->create(['password' => 'password123']);

        // 6 requests per minute.
        for ($i = 0; $i < 6; $i++) {
            // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:63
            $this->actingAs($user)
                ->postJson('/api/user/confirm-password', ['password' => 'password123'])
                ->assertStatus(200);
        }

        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:63
        $this->actingAs($user)
            ->postJson('/api/user/confirm-password', ['password' => 'password123'])
            ->assertStatus(429);
    }

    public function test_confirmed_password_status_reflects_the_session(): void
    {
        $user = User::factory()->create(['password' => 'Valid-Password1!']);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:197 (no direct CA call site)
        // CA reads: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:197 (the commented-out window)
        $this->actingAs($user)
            ->getJson('/api/user/confirmed-password-status')
            ->assertOk()
            ->assertJson(['confirmed' => false]);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:63
        $this->actingAs($user)
            ->postJson('/api/user/confirm-password', ['password' => 'Valid-Password1!'])
            ->assertOk();

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:197
        // CA reads: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:197
        $this->actingAs($user)
            ->getJson('/api/user/confirmed-password-status')
            ->assertOk()
            ->assertJson(['confirmed' => true]);
    }

    public function test_by_default_a_session_alone_cannot_read_or_change_two_factor(): void
    {
        $user = User::factory()->create([
            'password' => 'Valid-Password1!',
            'two_factor_secret' => encrypt(app(Google2FA::class)->generateSecretKey()),
            'two_factor_confirmed_at' => now(),
        ]);
        app(\Laravel\Fortify\Actions\GenerateNewRecoveryCodes::class)($user);

        // A stolen cookie or a Hub-ticket login has a session but no password confirmation.
        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:218 (`Api.get('/user/two-factor-secret-key')`)
        $this->actingAs($user)->getJson('/api/user/two-factor-secret-key')->assertStatus(423);
        // CA: packages/client-area/src/views/Login.vue:682 (`Api.get('/user/two-factor-recovery-codes')`)
        $this->actingAs($user)->getJson('/api/user/two-factor-recovery-codes')->assertStatus(423);
        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:46 (`Api.delete('/user/two-factor-authentication')`)
        $this->actingAs($user)->deleteJson('/api/user/two-factor-authentication')->assertStatus(423);

        $this->assertNotNull($user->fresh()->two_factor_confirmed_at);
    }

    public function test_flag_off_keeps_the_current_behaviour(): void
    {
        config(['auth.require_password_for_2fa' => false]);
        $user = User::factory()->create();

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:213
        $this->actingAs($user)
            ->postJson('/api/user/two-factor-authentication')
            ->assertOk();
    }

    public function test_flag_on_answers_423_until_the_password_is_confirmed(): void
    {
        config(['auth.require_password_for_2fa' => true]);
        $user = User::factory()->create(['password' => 'Valid-Password1!']);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:213
        // CA reads: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:213 (the CA shows the abort message)
        $this->actingAs($user)
            ->postJson('/api/user/two-factor-authentication')
            ->assertStatus(423)
            ->assertJson(['message' => ConfirmPasswordWhenRequired::SIGN_IN_AGAIN]);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:63
        $this->actingAs($user)
            ->postJson('/api/user/confirm-password', ['password' => 'Valid-Password1!'])
            ->assertOk();

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:213
        $this->actingAs($user)
            ->postJson('/api/user/two-factor-authentication')
            ->assertOk();
    }

    public function test_flag_on_wrong_password_is_a_validation_error(): void
    {
        config(['auth.require_password_for_2fa' => true]);
        $user = User::factory()->create(['password' => 'Valid-Password1!']);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:63
        // CA reads: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:63 (the CA shows the error alert)
        $this->actingAs($user)
            ->postJson('/api/user/confirm-password', ['password' => 'Wrong-Password1!'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    public function test_flag_on_the_confirmation_window_expires_after_900_seconds(): void
    {
        config(['auth.require_password_for_2fa' => true]);
        $user = User::factory()->create(['password' => 'Valid-Password1!']);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:63
        $this->actingAs($user)
            ->postJson('/api/user/confirm-password', ['password' => 'Valid-Password1!'])
            ->assertOk();

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:213
        $this->actingAs($user)
            ->postJson('/api/user/two-factor-authentication')
            ->assertOk();

        // 901 s later the window is stale again.
        Carbon::setTestNow(Carbon::now()->addSeconds(901));

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:213
        $this->actingAs($user)
            ->postJson('/api/user/two-factor-authentication')
            ->assertStatus(423);

        Carbon::setTestNow();
    }

    public function test_flag_on_login_confirms_and_recovery_codes_regenerate(): void
    {
        config(['auth.require_password_for_2fa' => true]);
        $user = User::factory()->create(['password' => 'Valid-Password1!']);

        // A successful password login counts as a confirmation, so the CA's
        // follow-up call in the same session is not blocked.
        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'Valid-Password1!'])
            ->assertOk();

        // CA: packages/client-area/src/views/Login.vue:681 (`Api.post('/user/two-factor-recovery-codes')`)
        $this->postJson('/api/user/two-factor-recovery-codes')->assertOk();
    }

    public function test_flag_on_a_two_factor_challenge_confirms_the_password(): void
    {
        config(['auth.require_password_for_2fa' => true]);
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'Valid-Password1!',
            'two_factor_secret' => encrypt(app(Google2FA::class)->generateSecretKey()),
            'two_factor_confirmed_at' => now(),
        ]);
        app(\Laravel\Fortify\Actions\GenerateNewRecoveryCodes::class)($user);

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        // CA reads: packages/client-area/src/apis/Auth.js:130 (`response.data.two_factor === true`)
        $this->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'Valid-Password1!'])
            ->assertJson(['two_factor' => true]);

        $secret = decrypt($user->fresh()->two_factor_secret);
        // CA: packages/client-area/src/apis/Auth.js:255 (`Api.post('/two-factor-challenge', data)`)
        $this->postJson('/api/two-factor-challenge', [
            'code' => app(Google2FA::class)->getCurrentOtp($secret),
        ])->assertNoContent();

        // The challenge completed right after the password step → confirmed,
        // so the CA's immediate recovery-code regeneration is not blocked.
        // CA: packages/client-area/src/views/Login.vue:681 (`Api.post('/user/two-factor-recovery-codes')`)
        $this->postJson('/api/user/two-factor-recovery-codes')->assertOk();
    }
}
