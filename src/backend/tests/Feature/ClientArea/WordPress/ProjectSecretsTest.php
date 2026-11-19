<?php

namespace Tests\Feature\ClientArea\WordPress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Projects\ProjectSecrets;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The project's credentials leave the panel only through the logged reveal:
 * the config list and the installation details carry a mask, and a separate
 * request behind the password confirmation answers one value.
 * @see packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
 * @see packages/client-area/src/components/dataIterator/tables/ConfigsTable.vue:110
 */
class ProjectSecretsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const WP_CONFIG = [
        ['name' => 'DB_NAME', 'value' => 'wpsite_db', 'type' => 'constant'],
        ['name' => 'DB_USER', 'value' => 'db-user-4', 'type' => 'constant'],
        ['name' => 'DB_PASSWORD', 'value' => 'db-secret-1', 'type' => 'constant'],
        ['name' => 'AUTH_KEY', 'value' => 'auth-secret-2', 'type' => 'constant'],
        ['name' => 'NONCE_SALT', 'value' => 'nonce-secret-3', 'type' => 'constant'],
        ['name' => 'WP_DEBUG', 'value' => 'false', 'type' => 'constant'],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        // A stateful origin, so Sanctum starts the session the confirmation reads.
        $this->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080');
    }

    private function application(User $user): Application
    {
        $application = $this->syncedApplication($user, 'wpsite');
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        return $application;
    }

    private function fakeConfig(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => self::WP_CONFIG]),
        ]);
    }

    private function confirmPassword(User $user): void
    {
        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:63 (`Api.post('/user/confirm-password', {password})`)
        $this->actingAs($user)
            ->postJson('/api/user/confirm-password', ['password' => 'password'])
            ->assertOk();
    }

    public function test_the_config_list_carries_masks_instead_of_the_keys_and_salts(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeConfig();

        // CA: packages/client-area/src/router/fetchData.js:224 (`fetchActiveInstanceConfig`)
        // CA reads: packages/client-area/src/components/dataIterator/tables/ConfigsTable.vue:110 (`item.value`, `item.type`)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/config")
            ->assertOk();

        $rows = array_column((array) $response->json('data'), null, 'name');

        $this->assertSame(ProjectSecrets::MASK, $rows['DB_USER']['value']);
        $this->assertTrue($rows['DB_USER']['secret']);
        $this->assertSame(ProjectSecrets::MASK, $rows['DB_PASSWORD']['value']);
        $this->assertTrue($rows['DB_PASSWORD']['secret']);
        $this->assertSame(ProjectSecrets::MASK, $rows['AUTH_KEY']['value']);
        $this->assertTrue($rows['AUTH_KEY']['secret']);
        $this->assertSame(ProjectSecrets::MASK, $rows['NONCE_SALT']['value']);
        $this->assertTrue($rows['NONCE_SALT']['secret']);

        // Everything else keeps its value and is not flagged.
        $this->assertSame('wpsite_db', $rows['DB_NAME']['value']);
        $this->assertArrayNotHasKey('secret', $rows['DB_NAME']);
        $this->assertSame('false', $rows['WP_DEBUG']['value']);

        $body = (string) $response->getContent();
        foreach (['db-user-4', 'db-secret-1', 'auth-secret-2', 'nonce-secret-3'] as $secret) {
            $this->assertStringNotContainsString($secret, $body);
        }
    }

    public function test_the_installation_details_mask_the_database_user_and_password(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeConfig();

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/wpsite/domains' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['version' => '6.5']]),
            // Engine: core/app/Http/Controllers/User/Wp/WpOptionController.php:104
            'engine.example.com/api/projects/wpsite/wp/options/blogname*' => Http::response(['data' => ['value' => 'My Shop']]),
            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => self::WP_CONFIG]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/Details.vue:89 (`Api.get(.../installation-details)`)
        // CA reads: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42 (`database_password`)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/installation-details")
            ->assertOk()
            ->assertJsonPath('data.database_name', 'wpsite_db')
            ->assertJsonPath('data.database_user', ProjectSecrets::MASK)
            ->assertJsonPath('data.database_password', ProjectSecrets::MASK);

        $body = (string) $response->getContent();
        $this->assertStringNotContainsString('db-user-4', $body);
        $this->assertStringNotContainsString('db-secret-1', $body);
    }

    public function test_reveal_answers_the_value_only_after_a_password_confirmation(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeConfig();

        // The CA posts the name of the secret the user asked to see.
        // CA: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
        // CA reads: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/secrets/reveal", ['secret' => 'DB_PASSWORD'])
            ->assertStatus(423)
            ->assertJsonPath('message', 'Password confirmation required.');

        // Nothing was revealed, and the refusal is in the project's log.
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'user.instance.secret.reveal',
            'application_id' => $application->id,
            'user_id' => $user->id,
        ]);
        $refused = ActivityLog::query()->latest('id')->firstOrFail();
        $this->assertFalse($refused->payload['granted']);
        $this->assertSame('DB_PASSWORD', $refused->payload['secret']);
        $this->assertSame(423, $refused->payload['status']);

        // CA: packages/client-area/src/components/modal/TwoFactorAuthDisableConfirmation.vue:63 (`Api.post('/user/confirm-password', {password})`)
        $this->actingAs($user)
            ->postJson('/api/user/confirm-password', ['password' => 'password'])
            ->assertOk();

        // CA: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
        // CA reads: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/secrets/reveal", ['secret' => 'DB_PASSWORD'])
            ->assertOk()
            ->assertJsonPath('data.secret', 'DB_PASSWORD')
            ->assertJsonPath('data.value', 'db-secret-1');

        // The database login answers through the same reveal.
        // CA: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
        // CA reads: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/secrets/reveal", ['secret' => 'DB_USER'])
            ->assertOk()
            ->assertJsonPath('data.value', 'db-user-4');

        // CA: packages/client-area/src/components/dataIterator/tables/ConfigsTable.vue:110
        // CA reads: packages/client-area/src/components/dataIterator/tables/ConfigsTable.vue:110
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/secrets/reveal", ['secret' => 'AUTH_KEY'])
            ->assertOk()
            ->assertJsonPath('data.value', 'auth-secret-2');

        // Every request is logged, granted ones too, with the caller's address.
        $this->assertSame(4, ActivityLog::query()->where('action', 'user.instance.secret.reveal')->count());
        $granted = ActivityLog::query()->where('action', 'user.instance.secret.reveal')->latest('id')->firstOrFail();
        $this->assertTrue($granted->payload['granted']);
        $this->assertSame('AUTH_KEY', $granted->payload['secret']);
        $this->assertSame(TestNetwork::LOOPBACK, $granted->ip_address);
        $this->assertSame('POST', $granted->request_method);
        $this->assertArrayHasKey('user_agent', $granted->payload);
        // The value itself is never written.
        $this->assertStringNotContainsString('auth-secret-2', (string) $granted->getRawOriginal('payload'));
    }

    public function test_reveal_refuses_a_name_that_is_not_a_secret(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeConfig();
        $this->confirmPassword($user);

        // CA: packages/client-area/src/components/dataIterator/tables/ConfigsTable.vue:110
        // CA reads: packages/client-area/src/components/dataIterator/tables/ConfigsTable.vue:110
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/secrets/reveal", ['secret' => 'DB_NAME'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('secret');

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'user.instance.secret.reveal',
            'application_id' => $application->id,
        ]);
    }

    public function test_reveal_is_throttled_per_user(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeConfig();
        $this->confirmPassword($user);

        for ($i = 0; $i < 10; $i++) {
            // CA: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
            $this->actingAs($user)
                ->postJson("/api/projects/{$application->id}/secrets/reveal", ['secret' => 'DB_PASSWORD'])
                ->assertOk();
        }

        // CA: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/secrets/reveal", ['secret' => 'DB_PASSWORD'])
            ->assertStatus(429);

        // The refusal the throttle answers leaves a row too, in the project's
        // log like every other attempt: the throttle runs ahead of the route's
        // own middleware and throws, so the limiter records it itself.
        $this->assertSame(11, ActivityLog::query()->where('action', 'user.instance.secret.reveal')->count());
        $throttled = ActivityLog::query()->latest('id')->firstOrFail();
        $this->assertFalse($throttled->payload['granted']);
        $this->assertSame(429, $throttled->payload['status']);
        $this->assertSame('DB_PASSWORD', $throttled->payload['secret']);
        $this->assertSame($application->id, $throttled->application_id);
        $this->assertSame($user->id, $throttled->user_id);
    }

    public function test_reveal_requires_authentication(): void
    {
        // CA: packages/client-area/src/components/cards/details/InstallationDetailsCard.vue:42
        $this->postJson('/api/projects/1/secrets/reveal', ['secret' => 'DB_PASSWORD'])->assertUnauthorized();
    }
}
