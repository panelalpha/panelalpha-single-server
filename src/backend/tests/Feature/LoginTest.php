<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * @see packages/api/routes/api.php:126 (old /login)
 * @see packages/client-area/src/apis/Auth.js:271-273 and views/Login.vue (the login steps)
 */
class LoginTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_email_only_step_asks_for_password(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        // CA reads: packages/client-area/src/apis/Auth.js:128 (`response.data.use_password === true`)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', ['email' => 'user@example.com'])
            ->assertOk()
            ->assertJson(['use_password' => true]);
    }

    /**
     * Community has no sign-up, so its `LoginPasswordSetup` default asks nothing – a user whose
     * password the panel generated (the Hub-paired setup) gets the usual password step, and no code is mailed.
     */
    public function test_community_has_no_set_password_step(): void
    {
        $this->assertInstanceOf(\PanelAlpha\ClientArea\Support\NoLoginPasswordSetup::class, app(\PanelAlpha\ClientArea\Contracts\LoginPasswordSetup::class));
        $user = User::factory()->create(['email' => 'user@example.com', 'password' => 'password123']);
        $user->forceFill(['password_generated' => true])->save();

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        // CA reads: packages/client-area/src/apis/Auth.js:128 (`response.data.use_password === true`)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', ['email' => 'user@example.com'])
            ->assertOk()
            ->assertExactJson(['use_password' => true]);

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        // CA reads: packages/client-area/src/views/Login.vue:655-665 (the error list)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', ['email' => 'user@example.com', 'password' => 'Another!Passw0rd'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
        $this->assertGuest();
    }

    public function test_login_rejects_an_email_array_with_422(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        // A malformed `email[]` must be a 422 (the old request rule was `required|string|email`),
        // never a cast the service could narrow.
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', ['email' => ['user@example.com']])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/apis/Auth.js:125 (the SPA surfaces the error alert)
            ->assertJsonValidationErrors('email');
    }

    public function test_login_succeeds_and_returns_home_with_user(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
            'name' => 'Demo User',
        ]);

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        // CA reads: packages/client-area/src/apis/Auth.js:138-139 (`store.commit('setHome', response.data)`, `response.data.user.services`)
        $response = $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', [
                'email' => 'user@example.com',
                'password' => 'password123',
                'remember' => true,
            ]);

        // CA reads: packages/client-area/src/apis/Auth.js:138-139 (`store.commit('setHome', response.data)`, `response.data.user.services`)
        $response
            ->assertOk()
            ->assertJsonPath('user.email', 'user@example.com')
            ->assertJsonPath('user.name', 'Demo User')
            ->assertJsonStructure([
                'app' => ['theme', 'languages'],
                'user' => ['email', 'services', 'language'],
            ]);

        $this->assertAuthenticatedAs(User::query()->where('email', 'user@example.com')->first());
    }

    public function test_login_without_a_stateful_origin_answers_a_clean_error(): void
    {
        $this->configureEngine();
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        // Without an Origin/Referer Sanctum never starts a session; the login
        // must answer the CA's 422 shape, never a 500 from session().
        // CA: packages/client-area/src/apis/Auth.js:125
        // CA reads: packages/client-area/src/apis/Auth.js:125 (the SPA surfaces the error alert)
        $this->postJson('/api/login', [
            'email' => 'user@example.com',
            'password' => 'password123',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_invalid_credentials_return_validation_error(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        // CA reads: packages/client-area/src/apis/Auth.js:125 (the CA surfaces the error alert)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', [
                'email' => 'user@example.com',
                'password' => 'wrong-password',
            ])
            ->assertStatus(422);
    }

    public function test_login_is_case_insensitive_on_email(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        // CA reads: packages/client-area/src/apis/Auth.js:138 (`store.commit('setHome', response.data)`)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', [
                'email' => 'User@Example.com',
                'password' => 'password123',
            ])
            ->assertOk()
            ->assertJsonPath('user.email', 'user@example.com');
    }

    public function test_five_password_attempts_are_allowed_and_the_sixth_is_refused(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        // The CA's two steps: the e-mail step, then the password. The limiter is per
        // lower(email)|ip and counts the password submissions only – five are answered, the sixth is 429.
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            // CA reads: packages/client-area/src/apis/Auth.js:128 (`response.data.use_password === true`)
            $this->postLogin(['email' => 'user@example.com'])
                ->assertOk()
                ->assertJson(['use_password' => true]);

            // CA reads: packages/client-area/src/apis/Auth.js:125 (the CA surfaces the error alert)
            $this->postLogin(['email' => 'user@example.com', 'password' => 'Wrong!Passw0rd'.$attempt])
                ->assertStatus(422)
                ->assertJsonValidationErrors('email');
        }

        // The e-mail step is still answered; the password attempt is refused.
        $this->postLogin(['email' => 'user@example.com'])->assertOk();
        $this->postLogin(['email' => 'user@example.com', 'password' => 'Wrong!Passw0rd6'])
            ->assertStatus(429);
    }

    public function test_the_email_step_has_its_own_looser_limit_per_ip(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        // The step that only names the address is not an attempt: 20 a minute from one IP address.
        for ($step = 1; $step <= 20; $step++) {
            $this->postLogin(['email' => 'user@example.com'])->assertOk();
        }

        $this->postLogin(['email' => 'user@example.com'])->assertStatus(429);
    }

    public function test_each_email_address_has_its_own_five_attempts(): void
    {
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        // Another address from the same IP address has its own five attempts.
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postLogin(['email' => 'user@example.com', 'password' => 'Wrong!Passw0rd'.$attempt])
                ->assertStatus(422);
        }

        $this->postLogin(['email' => 'user@example.com', 'password' => 'Wrong!Passw0rd6'])
            ->assertStatus(429);
        $this->postLogin(['email' => 'other@example.com', 'password' => 'Wrong!Passw0rd6'])
            ->assertStatus(422);
    }

    public function test_login_never_calls_the_engine(): void
    {
        // /login returns the /home payload; it must read the mirror/cache only
        //The Engine is configured so a
        // regression that reads the Engine really fails instead of being
        // swallowed as EngineNotConfigured.
        $this->configureEngine();
        User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', [
                'email' => 'user@example.com',
                'password' => 'password123',
            ])
            ->assertOk();
    }

    public function test_authenticated_home_includes_user(): void
    {
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'password123',
        ]);

        // CA: packages/client-area/src/views/Account.vue:496 (`Api.get('/home')`)
        // CA reads: packages/client-area/src/apis/Auth.js:138 (`store.commit('setHome', response.data)`)
        $this->actingAs($user)
            ->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('user.email', 'user@example.com');
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function postLogin(array $payload): TestResponse
    {
        // CA: packages/client-area/src/apis/Auth.js:125 (`Api.post('/login', post)`)
        return $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/login', $payload);
    }
}
