<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\Auth\LoginService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PragmaRX\Google2FA\Google2FA;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The two-factor routes: /two-factor-challenge, enable/confirm/disable,
 * QR code, secret key, recovery codes.
 * @see packages/api/routes/api.php:788-829 (old two-factor routes)
 */
class TwoFactorAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Sanctum starts the session (needed by the 2FA actions) only for a
        // trusted Origin, exactly as the Client Area sends.
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080');
        // The 2FA routes need a recent password confirmation
        // (PasswordConfirmationTest); here the session already has one.
        $this->withSession(['auth.password_confirmed_at' => time()]);
    }

    public function test_enable_exposes_qr_and_secret_key(): void
    {
        $user = User::factory()->create();

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:213 (`Api.post('/user/two-factor-authentication')`)
        $this->actingAs($user)->postJson('/api/user/two-factor-authentication')->assertOk();

        $this->assertNotNull($user->fresh()->two_factor_secret);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:215 (`Api.get('/user/two-factor-qr-code')`)
        // CA reads: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:217 (`response.data.svg`)
        $this->actingAs($user)
            ->getJson('/api/user/two-factor-qr-code')
            ->assertOk()
            ->assertJsonStructure(['svg', 'url']);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:218 (`Api.get('/user/two-factor-secret-key')`)
        // CA reads: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:220 (`response.data.secretKey`)
        $this->actingAs($user)
            ->getJson('/api/user/two-factor-secret-key')
            ->assertOk()
            ->assertJsonStructure(['secretKey']);
    }

    public function test_confirm_then_recovery_codes_then_disable(): void
    {
        $user = User::factory()->create();
        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:213
        $this->actingAs($user)->postJson('/api/user/two-factor-authentication')->assertOk();

        $secret = decrypt($user->fresh()->two_factor_secret);
        $code = app(Google2FA::class)->getCurrentOtp($secret);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:166 (`Api.post('/user/confirmed-two-factor-authentication', {code})`)
        $this->actingAs($user)
            ->postJson('/api/user/confirmed-two-factor-authentication', ['code' => $code])
            ->assertOk();
        $this->assertNotNull($user->fresh()->two_factor_confirmed_at);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:168 (`Api.get('/user/two-factor-recovery-codes')`)
        // CA reads: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:173 (`this.recoveryCode = response.data`)
        $this->actingAs($user)
            ->getJson('/api/user/two-factor-recovery-codes')
            ->assertOk()
            ->assertJsonCount(8);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:46 (`Api.delete('/user/two-factor-authentication')`)
        $this->actingAs($user)->deleteJson('/api/user/two-factor-authentication')->assertOk();
        $this->assertNull($user->fresh()->two_factor_secret);
    }

    public function test_login_with_two_factor_enabled_returns_challenge_and_challenge_completes(): void
    {
        $user = $this->userWithConfirmedTwoFactor();
        $secret = decrypt($user->two_factor_secret);

        // Password step now asks for a code instead of logging in.
        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        // CA reads: packages/client-area/src/apis/Auth.js:130 (`response.data.two_factor === true`)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password123'])
            ->assertOk()
            ->assertJson(['two_factor' => true]);

        $this->assertGuest();

        // Complete the challenge with a valid TOTP code.
        $code = app(Google2FA::class)->getCurrentOtp($secret);
        // CA: packages/client-area/src/apis/Auth.js:255 (`Api.post('/two-factor-challenge', data)`)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/two-factor-challenge', ['code' => $code])
            ->assertNoContent();

        $this->assertAuthenticatedAs($user->fresh());

        // The old panel recorded the login on the Device listener for both
        // password and 2FA logins.
        $device = \App\Models\Device::query()
            ->where('authenticatable_type', \App\Models\User::class)
            ->where('authenticatable_id', $user->id)
            ->first();
        $this->assertNotNull($device, 'The 2FA challenge did not record the device login.');
        $this->assertNotNull($device->last_login);
    }

    public function test_invalid_two_factor_code_is_rejected(): void
    {
        $this->userWithConfirmedTwoFactor();

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        // CA reads: packages/client-area/src/apis/Auth.js:130 (`response.data.two_factor === true`)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password123'])
            ->assertOk()
            ->assertJson(['two_factor' => true]);

        // CA: packages/client-area/src/apis/Auth.js:255 (`Api.post('/two-factor-challenge', data)`)
        // CA reads: packages/client-area/src/apis/Auth.js:255 (the CA surfaces the error through its interceptor)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/two-factor-challenge', ['code' => '000000'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('code')
            ->assertJsonPath('errors.code.0', 'The entered code is invalid.');
    }

    public function test_a_wrong_code_to_confirm_two_factor_answers_the_documented_message(): void
    {
        $user = User::factory()->create();
        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:213 (`Api.post('/user/two-factor-authentication')`)
        $this->actingAs($user)->postJson('/api/user/two-factor-authentication')->assertOk();

        // The dialog already shows the same words (`notification.account.2fa.error`).
        // CA: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:166 (`Api.post('/user/confirmed-two-factor-authentication', {code})`)
        $this->actingAs($user)
            ->postJson('/api/user/confirmed-two-factor-authentication', ['code' => '000000'])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/components/modal/TwoFactorAuthModal.vue:166 (the dialog's failure copy)
            ->assertJsonValidationErrors('code')
            ->assertJsonPath('errors.code.0', 'The entered code is invalid.');
    }

    public function test_a_challenge_without_a_session_is_refused_instead_of_failing(): void
    {
        $this->userWithConfirmedTwoFactor();

        // No Origin/Referer (a script, not the SPA): Sanctum starts no session,
        // so the throttle limiter and Fortify's request both called session()
        // with none and the route answered 500 "Session store not set on request".
        $this->flushHeaders();

        // CA: packages/client-area/src/apis/Auth.js:255 (`Api.post('/two-factor-challenge', data)`)
        $response = $this->postJson('/api/two-factor-challenge', ['code' => '000000']);
        $response->assertStatus(422);
        // The Client Area reads errors.code for a code of up to 6 characters.
        $this->assertSame([LoginService::SESSION_EXPIRED_MESSAGE], $response->json('errors.code'));

        // CA: packages/client-area/src/apis/Auth.js:255 (`Api.post('/two-factor-challenge', data)`)
        $response = $this->postJson('/api/two-factor-challenge', ['recovery_code' => 'not-a-real-recovery-code']);
        $response->assertStatus(422);
        $this->assertSame([LoginService::SESSION_EXPIRED_MESSAGE], $response->json('errors.recovery_code'));

        // CA: packages/client-area/src/apis/Auth.js:255 (`Api.post('/two-factor-challenge', data)`)
        $response = $this->postJson('/api/two-factor-challenge');
        $response->assertStatus(422);
        $this->assertSame([LoginService::SESSION_EXPIRED_MESSAGE], $response->json('errors.code'));
    }

    public function test_two_factor_challenge_is_rate_limited(): void
    {
        $this->userWithConfirmedTwoFactor();

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password123'])
            ->assertOk();

        // throttle:two-factor keys on session('login.id'); five allowed, the sixth 429.
        for ($attempt = 0; $attempt < 5; $attempt++) {
            // CA: packages/client-area/src/apis/Auth.js:255
            $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
                ->postJson('/api/two-factor-challenge', ['code' => '000000']);
        }

        // CA: packages/client-area/src/apis/Auth.js:255
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/two-factor-challenge', ['code' => '000000'])
            ->assertStatus(429);
    }

    public function test_two_factor_challenge_accepts_a_recovery_code_and_reports_an_invalid_one(): void
    {
        $user = $this->userWithConfirmedTwoFactor();
        $recoveryCode = $user->recoveryCodes()[0];

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        // CA reads: packages/client-area/src/apis/Auth.js:130 (`response.data.two_factor === true`)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'password123'])
            ->assertOk()
            ->assertJson(['two_factor' => true]);

        // A wrong recovery code answers on `recovery_code`, the key the CA reads
        // once the entered code is longer than six characters.
        // CA: packages/client-area/src/views/Login.vue:786 (`twoFactorAuthData = { recovery_code: … }`)
        // CA reads: packages/client-area/src/views/Login.vue:715 (`error.response.data.errors.recovery_code`)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/two-factor-challenge', ['recovery_code' => 'not-a-real-recovery-code'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('recovery_code')
            ->assertJsonPath('errors.recovery_code.0', 'The entered backup code is invalid.');

        // A real recovery code completes the challenge (and is consumed).
        // CA: packages/client-area/src/views/Login.vue:786
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/two-factor-challenge', ['recovery_code' => $recoveryCode])
            ->assertNoContent();

        $this->assertAuthenticatedAs($user->fresh());
    }

    /**
     * A user with 2FA already enabled and confirmed (hasEnabledTwoFactorAuthentication
     * requires both the secret and two_factor_confirmed_at).
     */
    private function userWithConfirmedTwoFactor(): User
    {
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
            'two_factor_secret' => encrypt(app(Google2FA::class)->generateSecretKey()),
            'two_factor_confirmed_at' => now(),
        ]);
        // Recovery codes must be present for a challenge to be offered.
        app(\Laravel\Fortify\Actions\GenerateNewRecoveryCodes::class)($user);

        return $user->fresh();
    }
}
