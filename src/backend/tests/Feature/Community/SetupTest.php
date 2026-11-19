<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Contracts\Auth\Guard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The first-run wizard's data step (`POST /api/community/setup`).
 */
class SetupTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    /**
     * @return array<string, string>
     */
    private function body(array $override = []): array
    {
        return array_merge([
            'server_name' => 'My panel',
            'name' => 'Ada',
            'email' => 'ada@example.com',
            'password' => 'Valid-Password1!',
            'password_confirmation' => 'Valid-Password1!',
        ], $override);
    }

    private function submit(array $override = [], bool $stateful = true): \Illuminate\Testing\TestResponse
    {
        $client = $stateful ? $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080') : $this;

        return $client->postJson('/api/community/setup', $this->body($override));
    }

    public function test_it_creates_the_user_names_the_server_and_logs_in(): void
    {
        // CA reads: packages/client-area/src/views/Setup/SetupData.vue:136 (the status only; the Hub step follows at :146)
        $this->submit()->assertCreated()->assertExactJson([]);

        $this->assertDatabaseCount('users', 1);
        $this->assertSame('My panel', app(PanelSettings::class)->get('userapp.name'));
        $this->assertAuthenticatedAs(User::query()->firstOrFail());

        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            // CA: packages/client-area/src/apis/Setup.js:4
            ->getJson('/api/home')
            ->assertOk()
            // CA reads: packages/client-area/src/views/Setup/SetupSummary.vue:79 (user.email)
            ->assertJsonPath('user.email', 'ada@example.com');
    }

    public function test_without_a_stateful_origin_it_answers_400_and_creates_no_user(): void
    {
        // CA reads: packages/client-area/src/views/Setup/SetupData.vue:155 (the error message)
        $this->submit(stateful: false)->assertStatus(400)->assertJsonStructure(['message']);

        $this->assertDatabaseCount('users', 0);
    }

    public function test_a_second_call_answers_409(): void
    {
        $this->submit()->assertCreated();
        // CA reads: packages/client-area/src/views/Setup/SetupData.vue:148 (the 409 status)
        $this->submit(['email' => 'other@example.com'])->assertStatus(409)->assertJsonStructure(['message']);

        $this->assertDatabaseCount('users', 1);
    }

    public function test_a_held_lock_answers_409(): void
    {
        $lock = Cache::lock('community:first-user', 30);
        $this->assertTrue($lock->get());

        try {
            $this->submit()->assertStatus(409);
        } finally {
            $lock->release();
        }

        $this->assertDatabaseCount('users', 0);
    }

    public function test_invalid_input_answers_422(): void
    {
        $this->submit(['password' => 'weak', 'password_confirmation' => 'weak'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:155 (the validation errors)
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->submit(['password_confirmation' => 'Different-Password1!'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:155 (the validation errors)
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->submit(['email' => 'not-an-email'])
            // CA reads: packages/client-area/src/views/Setup/SetupData.vue:155 (the validation errors)
            ->assertStatus(422)->assertJsonValidationErrors('email');

        $this->assertDatabaseCount('users', 0);
    }

    public function test_it_is_refused_after_a_failed_first_user_creation(): void
    {
        $this->markFirstUserCreationFailed();

        // CA reads: packages/client-area/src/views/Setup/SetupData.vue:155 (the error message)
        $this->submit()->assertStatus(409)->assertJsonPath(
            'message',
            'The first account could not be created from PANELALPHA_USER_EMAIL and PANELALPHA_USER_PASSWORD. '
                .'Fix them and restart the panel, or run `php artisan users:create` on the server.',
        );
        // The gate runs before the body validation, like the other 409s.
        $this->submit(['email' => 'not-an-email', 'password' => 'weak', 'password_confirmation' => 'weak'])->assertStatus(409);

        $this->assertDatabaseCount('users', 0);
    }

    public function test_the_refusal_ends_once_an_account_exists(): void
    {
        $this->markFirstUserCreationFailed();
        User::factory()->create();

        // CA reads: packages/client-area/src/views/Setup/SetupData.vue:148 (the 409 status)
        $this->submit()->assertStatus(409)->assertJsonPath('message', 'The setup is already done.');

        $this->assertDatabaseCount('users', 1);
    }

    private function markFirstUserCreationFailed(): void
    {
        $marker = storage_path('framework/testing/first-user-failed-'.bin2hex(random_bytes(4)));
        config(['community.first_user_failed_marker' => $marker]);
        file_put_contents($marker, '');
        $this->beforeApplicationDestroyed(fn () => @unlink($marker));
    }

    public function test_the_sixth_call_within_a_minute_answers_429(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->submit(['email' => 'bad'])->assertStatus(422);
        }

        $this->submit(['email' => 'bad'])->assertStatus(429);
    }

    public function test_it_is_a_404_outside_single_user_mode(): void
    {
        $this->bindMultiUserEdition([]);

        $this->submit()->assertNotFound();

        $this->assertDatabaseCount('users', 0);
    }

    public function test_an_invalid_body_does_not_mask_the_gates(): void
    {
        $invalid = ['email' => 'not-an-email', 'password' => 'weak', 'password_confirmation' => 'weak'];

        $this->submit($invalid, stateful: false)->assertStatus(400);

        $this->submit()->assertCreated();
        $this->submit($invalid)->assertStatus(409);

        $this->bindMultiUserEdition([]);
        $this->submit($invalid)->assertNotFound();
    }

    public function test_a_guard_that_cannot_log_in_creates_no_user(): void
    {
        $factory = \Mockery::mock(AuthFactory::class);
        $factory->shouldReceive('guard')->andReturn(\Mockery::mock(Guard::class));
        $this->app->instance(AuthFactory::class, $factory);

        $this->withoutExceptionHandling();
        $this->expectException(\LogicException::class);

        try {
            $this->submit();
        } finally {
            $this->assertDatabaseCount('users', 0);
        }
    }

    public function test_the_route_is_named_after_the_package(): void
    {
        $route = Route::getRoutes()->getByName('community.setup.store');

        $this->assertNotNull($route);
        $this->assertSame('api/community/setup', $route->uri());
        $this->assertContains('POST', $route->methods());
        $this->assertNotContains('auth', $route->gatherMiddleware());
    }
}
