<?php

namespace Tests\Feature\ClientArea\WordPress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\PhpIdentifier;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * WordPress config and user management.
 * @see packages/client-area/src/mixins/UsersActionsMixin.js:163
 * @see Engine core/routes/api.php:284-294 (wp/users, wp/users/{u}/sso)
 */
class WordPressUsersConfigTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user): Application
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/UserController.php:122
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'wpsite'),
        ]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        $application = Application::query()->where('engine_username', 'wpsite')->firstOrFail();
        // WordPress endpoints require a detected WordPress project.
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        return $application;
    }

    public function test_config_list_and_set(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67 → Config::list
        // (core/app/System/Project/PhpHosting/WordPress/Config.php:28) with
        // `{data:[{name,value,type}]}` (WP-CLI `config list --format=json`).
        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => [
                ['name' => 'WP_DEBUG', 'value' => 'true', 'type' => 'constant'],
            ]]),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:224 (`fetchActiveInstanceConfig`)
        // CA reads: packages/client-area/src/router/fetchData.js:225 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/config")
            ->assertOk()
            ->assertJsonPath('data.0.name', 'WP_DEBUG')
            ->assertJsonPath('data.0.value', 'true')
            ->assertJsonPath('data.0.type', 'constant');

        // The CA's edit form sends {name,value,type} (ConfigActionsMixin.js:150-201).
        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:199 (`{name, value, type}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/config/WP_DEBUG", [
                'name' => 'WP_DEBUG',
                'value' => 'false',
                'type' => 'constant',
            ])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'PUT' && $r['value'] === 'false' && $r['type'] === 'constant');
        // skip_plugins keeps a broken plugin from hiding the list.
        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && str_contains($r->url(), '/wp/config')
            && ($r['skip_plugins'] ?? null) == 1);
    }

    public function test_config_create_refuses_a_name_longer_than_the_255_characters_the_column_takes(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:121 (`{name, value, type}`)
        // CA reads: packages/client-area/src/mixins/ConfigActionsMixin.js:212 (a 422's field error is the message)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/config", [
                'name' => 'A'.str_repeat('B', 255),
                'value' => 'true',
                'type' => 'constant',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name' => 'The name field must not be greater than 255 characters.']);

        Http::assertNotSent(fn ($r) => $r->method() === 'PUT' && str_contains($r->url(), '/wp/config/'));
    }

    public function test_config_create_maps_to_a_put_of_one_constant(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Adding a constant is a PUT of that constant, never Engine `POST wp/config`
        // (which creates wp-config.php).
        // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:258
        Http::fake(['engine.example.com/api/projects/wpsite/wp/config/*' => Http::response(['data' => ['constant' => 'WP_DEBUG', 'value' => 'true']])]);

        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:121 (`{name, value, type}`)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/config", [
                'name' => 'WP_DEBUG',
                'value' => 'true',
                'type' => 'constant',
            ])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && str_ends_with($r->url(), '/wp/config/WP_DEBUG')
            && $r['value'] === 'true'
            && $r['type'] === 'constant');
        Http::assertNotSent(fn ($r) => $r->method() === 'POST' && str_contains($r->url(), '/wp/config'));
    }

    public function test_config_create_refuses_a_name_that_is_not_a_php_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The Engine's route carries a PHP constant or variable name only; any
        // other name made `PUT wp/config/{name}` answer a routing 405.
        foreach (['BAD NAME!', '1BAD', 'BAD-NAME', 'BAD.NAME'] as $name) {
            // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:121 (`{name, value, type}`)
            // CA reads: packages/client-area/src/mixins/ConfigActionsMixin.js:212 (a 422's field error is the alert text)
            $this->actingAs($user)
                ->postJson("/api/projects/{$application->id}/wordpress/config", [
                    'name' => $name,
                    'value' => 'true',
                    'type' => 'constant',
                ])
                ->assertStatus(422)
                ->assertJsonValidationErrors('name');
        }

        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:121 (`{name, value, type}`)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/config", [
                'name' => '1BAD',
                'value' => 'true',
                'type' => 'variable',
            ])
            ->assertStatus(422);

        Http::assertNotSent(fn ($r) => $r->method() === 'PUT' && str_contains($r->url(), '/wp/config/'));
    }

    public function test_a_config_name_the_engine_cannot_route_is_a_name_error(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:258
            // (the route's PUT; a `{name}` its constraint does not match answers a Laravel routing 405 first)
            'engine.example.com/api/projects/wpsite/wp/config/*' => Http::response([
                'message' => 'The PUT method is not supported for route api/projects/wpsite/wp/config/1BAD. Supported methods: GET, HEAD.',
            ], 405),
        ]);

        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:121 (`{name, value, type}`)
        // CA reads: packages/client-area/src/mixins/ConfigActionsMixin.js:212 (a 422's field error is the alert text)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/config", [
                'name' => 'WP_DEBUG',
                'value' => 'true',
                'type' => 'constant',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name' => PhpIdentifier::REFUSAL]);

        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:199 (`{name, value, type}`)
        // CA reads: packages/client-area/src/mixins/ConfigActionsMixin.js:212
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/config/1BAD", ['value' => 'true', 'type' => 'constant'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name' => PhpIdentifier::REFUSAL]);

        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:41 (`{type}` in the DELETE body)
        // CA reads: packages/client-area/src/mixins/ConfigActionsMixin.js:58 (`Api.getErrorMessage(error)` on 422)
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/config/1BAD", ['type' => 'constant'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name' => PhpIdentifier::REFUSAL]);
    }

    public function test_config_update_and_delete_require_the_old_type_rules(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

// Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:318
        Http::fake(['engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => []])]);

        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:199 (`{name, value, type}`)
        // CA reads: packages/client-area/src/mixins/ConfigActionsMixin.js:212 (the CA shows `Api.getErrorMessage(error)` on 422)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/config/WP_DEBUG", ['value' => 'true'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('type');

        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:199 (`{name, value, type}`)
        // CA reads: packages/client-area/src/mixins/ConfigActionsMixin.js:212
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/config/WP_DEBUG", ['value' => 'true', 'type' => 'boolean'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('type');

        // Old ConfigController::destroy: `type` required in the DELETE body
        // (the CA sends it, ConfigActionsMixin.js:41-45).
        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:41 (`{type}` in the DELETE body)
        // CA reads: packages/client-area/src/mixins/ConfigActionsMixin.js:58 (`Api.getErrorMessage(error)` on 422)
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/config/WP_DEBUG")
            ->assertStatus(422)
            ->assertJsonValidationErrors('type');

        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:41 (`{type}` in the DELETE body)
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/config/WP_DEBUG", ['type' => 'constant'])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'DELETE' && $r['type'] === 'constant');
        Http::assertNotSent(fn ($r) => $r->method() === 'DELETE' && ! array_key_exists('type', $r->data()));
    }

    public function test_config_value_is_capped_at_the_bytes_the_engine_reads_back(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:318 (a PUT of one constant)
        Http::fake(['engine.example.com/api/projects/wpsite/wp/config*' => Http::response(['data' => []])]);

        // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67 -> Config::list, which fails on a
        // wp-config.php holding a value of 4095 bytes or more (4094 bytes still reads). A character outside plain
        // ASCII is more than one byte (`ą` 2, `€` 3), so its character count stays under the limit the bytes exceed.
        $refusal = 'The value is too long: it can be at most 4094 bytes, fewer characters when a character is not plain ASCII.';
        $tooLong = [str_repeat('v', 4095), str_repeat('ą', 2048), str_repeat('€', 1365)];

        foreach ($tooLong as $value) {
            // CA: packages/client-area/src/views/instance/advanced/WordpressConfig.vue:1-27 (the Create form stops at the same byte length)
            // CA reads: packages/client-area/src/mixins/ConfigActionsMixin.js:212 (a 422's field error is the message)
            $this->actingAs($user)
                ->postJson("/api/projects/{$application->id}/wordpress/config", [
                    'name' => 'FX_BIG',
                    'value' => $value,
                    'type' => 'constant',
                ])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['value' => $refusal]);

            // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:199 (`{name, value, type}`)
            // CA reads: packages/client-area/src/mixins/ConfigActionsMixin.js:212 (a 422's field error is the message)
            $this->actingAs($user)
                ->putJson("/api/projects/{$application->id}/wordpress/config/FX_BIG", [
                    'value' => $value,
                    'type' => 'constant',
                ])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['value' => $refusal]);
        }

        Http::assertNotSent(fn ($r) => $r->method() !== 'GET' && str_contains($r->url(), '/wp/config'));

        $accepted = [str_repeat('v', 4094), str_repeat('ą', 2047), str_repeat('€', 1364)];

        foreach ($accepted as $value) {
            // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:121 (`{name, value, type}`)
            $this->actingAs($user)
                ->postJson("/api/projects/{$application->id}/wordpress/config", [
                    'name' => 'FX_BIG',
                    'value' => $value,
                    'type' => 'constant',
                ])
                ->assertOk();

            // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:199 (`{name, value, type}`)
            $this->actingAs($user)
                ->putJson("/api/projects/{$application->id}/wordpress/config/FX_BIG", [
                    'value' => $value,
                    'type' => 'constant',
                ])
                ->assertOk();

            Http::assertSent(fn ($r) => $r->method() === 'PUT'
                && str_ends_with($r->url(), '/wp/config/FX_BIG')
                && $r['value'] === $value
                && strlen((string) $r['value']) <= 4094);
        }
    }

    public function test_a_config_is_removed_by_name_when_the_list_does_not_load(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:318 (the DELETE of one constant)
            'engine.example.com/api/projects/wpsite/wp/config/FX_BIG' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67 -> Config::list
            'engine.example.com/api/projects/wpsite/wp/config*' => Http::response(
                ['message' => "Error: No matching entries found in 'wp-config.php'."],
                422,
            ),
        ]);

        // The broken read: the page has no row to delete.
        // CA: packages/client-area/src/router/fetchData.js:224 (`fetchActiveInstanceConfig`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/config")
            ->assertStatus(422);

        // CA: packages/client-area/src/mixins/ConfigActionsMixin.js:41 (`{type}` in the DELETE body; the name is the path)
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/config/FX_BIG", ['type' => 'constant'])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && str_ends_with($r->url(), '/wp/config/FX_BIG')
            && $r['type'] === 'constant');
    }

    public function test_users_list_and_create(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:75
            'engine.example.com/api/projects/wpsite/wp/users*' => Http::response(['data' => [
                // WP-CLI `user list --format=json` row.
                ['ID' => 1, 'user_login' => 'admin', 'user_email' => 'admin@example.com', 'display_name' => 'Admin', 'roles' => ['administrator'], 'user_registered' => '2026-01-01 00:00:00'],
            ]]),
        ]);

        // CA: packages/client-area/src/views/instance/advanced/WordpressUsers.vue:182
        // CA reads: packages/client-area/src/views/instance/advanced/WordpressUsers.vue:129,135,141,147,153
        // (`username`, `display_name`, `email`, `role`, `user_registered`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/users")
            ->assertOk()
            ->assertJsonPath('data.0.username', 'admin')
            ->assertJsonPath('data.0.id', 1)
            ->assertJsonPath('data.0.display_name', 'Admin')
            ->assertJsonPath('data.0.email', 'admin@example.com')
            ->assertJsonPath('data.0.role', ['administrator'])
            ->assertJsonPath('data.0.user_registered', '2026-01-01 00:00:00');

        // The CA sends `username`; the service maps it to the Engine's `login`.
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:163 (`{username,email,display_name,password,role,send_email}`)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/users", [
                'username' => 'editor',
                'email' => 'editor@example.com',
                'display_name' => 'Editor',
                'password' => 'Secret-Password1!',
                'role' => 'editor',
                'send_email' => false,
            ])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'POST' && $r['login'] === 'editor');
        // Every field the CA sends reaches the Engine.
        Http::assertSent(fn ($r) => $r->method() === 'POST'
            && $r['login'] === 'editor'
            && $r['email'] === 'editor@example.com'
            && $r['display_name'] === 'Editor'
            && $r['password'] === 'Secret-Password1!'
            && $r['role'] === 'editor'
            && $r['send_email'] === false);
    }

    public function test_users_role_is_validated_against_the_old_list(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Old UserStoreRequest/UserUpdateRequest: role in:administrator,editor,
        // author,contributor,subscriber.
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:163 (`{role}`)
        // CA reads: packages/client-area/src/mixins/UsersActionsMixin.js:175 (`Api.getErrorMessage(error)` on 422)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/users", [
                'username' => 'super',
                'email' => 'super@example.com',
                'display_name' => 'Super',
                'password' => 'Secret-Password1!',
                'role' => 'superadmin',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('role');

        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:274 (`{role}`)
        // CA reads: packages/client-area/src/mixins/UsersActionsMixin.js:288 (`Api.getErrorMessage(error)` on 422)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/users/2", [
                'email' => 'super@example.com',
                'display_name' => 'Super',
                'role' => 'superadmin',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('role');
    }

    public function test_wordpress_user_create_passwords_follow_the_panel_policy(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Password::defaults() replaces the old min:8 + Zxcvbn(2) on the
        // store request (packages/api/.../UserStoreRequest.php:33); the CA
        // form checks 8 chars only (UsersActionsMixin.js:118-131), the panel
        // policy is the stronger rule.
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:163 (`{password}`)
        // CA reads: packages/client-area/src/mixins/UsersActionsMixin.js:121-125 (the CA's 8-char rule)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/users", [
                'username' => 'editor',
                'email' => 'editor@example.com',
                'display_name' => 'Editor',
                'password' => 'weakpass',
                'role' => 'editor',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/wp/users'));
    }

    public function test_wordpress_user_update_keeps_the_old_password_rule(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:195 -> wp/users update
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users/2' => Http::response(['data' => []])]);

        // The old UserUpdateRequest was only `nullable|string|max:255` – no
        // strength rule (packages/api/.../UserUpdateRequest.php:26-30); the
        // update must accept a weak password and send it.
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:274 (`{password}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/users/2", [
                'email' => 'editor@example.com',
                'display_name' => 'Editor',
                'role' => 'editor',
                'password' => 'weakpass',
            ])
            ->assertOk();

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/wp/users/2')
            && $request['password'] === 'weakpass');

        // The old `max:255` still applies to an update.
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:274 (`{password}`)
        // CA reads: packages/client-area/src/mixins/UsersActionsMixin.js:288 (`Api.getErrorMessage(error)` on 422)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/users/2", [
                'email' => 'editor@example.com',
                'display_name' => 'Editor',
                'role' => 'editor',
                'password' => str_repeat('a', 256),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    public function test_wordpress_user_update_accepts_an_empty_password(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

// Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:195
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users/2' => Http::response(['data' => []])]);

        // The edit modal leaves the field empty to keep the password
        // (`field.passwordLeaveEmpty`); the old panel skipped an empty password
        // (`!empty($params['password'])`), so it must neither validate nor reach
        // the Engine.
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:274 (`{password: ''}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/users/2", [
                'email' => 'editor@example.com',
                'display_name' => 'Editor',
                'role' => 'editor',
                'password' => '',
            ])
            ->assertOk();

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/wp/users/2')
            && ! array_key_exists('password', $request->data()));
    }

    public function test_delete_wordpress_user_by_email_hits_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:257 → WpUserController::destroy,
        // `DELETE wp/users/{user}` 200 `{data:{user,message}}` (WP-CLI accepts the login or email).
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users/admin%40example.com' => Http::response(['data' => ['user' => 'admin@example.com', 'message' => "Success: Deleted user 'admin'."]])]);

        // The CA deletes by the row's `email`, not its id (UsersActionsMixin.js:41).
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:41
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/users/admin@example.com")
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'DELETE'
            && str_contains($r->url(), '/wp/users/admin%40example.com'));
    }

    public function test_reset_password_generates_a_password(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:307
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users/2/password' => Http::response(['data' => ['user' => 'editor']])]);

        // The CA sends the whole user row as the body (UsersActionsMixin.js:326-329).
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:326 (`item` as the body)
        $response = $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/users/2/reset-password", [
                'id' => 1,
                'username' => 'admin',
                'display_name' => 'Admin',
                'email' => 'admin@example.com',
                'role' => ['administrator'],
                'user_registered' => '2026-01-01 00:00:00',
            ])
            ->assertOk()
            ->json();

        $this->assertNotEmpty($response['new_password']);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/wp/users/2/password') && $r['password'] === $response['new_password']);
    }

    public function test_sso_url_uses_the_user_from_the_body(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: `POST wp/users/{id}/sso` → `{data:{url}}`.
// Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:358
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users/2/sso' => Http::response(['data' => ['url' => 'https://wp.example.com/sso/tok']])]);

        // CA: packages/client-area/src/components/modal/WpAdminSsoModal.vue:272 (`{user}`)
        // CA reads: packages/client-area/src/components/modal/WpAdminSsoModal.vue:275 (`response.data.data.sso_url`)
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/sso-url", ['user' => '2'])
            ->assertOk()
            ->assertJsonPath('data.sso_url', 'https://wp.example.com/sso/tok');
    }

    /**
     * Bind the edition answer that limits SSO to WordPress user 2 (old
     * `User::getRestrictedWordpressUserIdForApplication()`: a collaborator bound
     * to one WordPress user); Community answers null.
     */
    private function restrictSsoToUser(int $wordPressUserId): void
    {
        $this->app->instance(\PanelAlpha\ClientArea\Contracts\WordPressSsoRestriction::class, new class($wordPressUserId) implements \PanelAlpha\ClientArea\Contracts\WordPressSsoRestriction
        {
            public function __construct(private readonly int $id) {}

            public function wordPressUserIdFor(\Illuminate\Contracts\Auth\Authenticatable $user, Application $application): ?int
            {
                return $this->id;
            }
        });
    }

    private function fakeTwoUsers(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:75
            'engine.example.com/api/projects/wpsite/wp/users*' => Http::response(['data' => [
                ['ID' => 1, 'user_login' => 'admin', 'user_email' => 'admin@example.com', 'display_name' => 'Admin', 'roles' => ['administrator'], 'user_registered' => '2026-01-01 00:00:00'],
                ['ID' => 2, 'user_login' => 'editor', 'user_email' => 'editor@example.com', 'display_name' => 'Editor', 'roles' => ['administrator'], 'user_registered' => '2026-01-02 00:00:00'],
            ]]),
        ]);
    }

    /**
     * The Engine has no `for_sso` (v1 sent it and the Engine dropped it): the
     * SSO picker of a user limited to one WordPress user lists only that user,
     * panel-side (old UserController.php:71-81); the parameter is no longer
     * forwarded.
     */
    public function test_the_sso_picker_lists_only_the_restricted_wordpress_user(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeTwoUsers();
        $this->restrictSsoToUser(2);

        // CA: packages/client-area/src/mixins/OpenModalAction.js:26
        $sso = $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/users?role=administrator&for_sso=1")->assertOk();
        // CA reads: packages/client-area/src/mixins/OpenModalAction.js:27-31 (the users to pick from)
        $sso->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', 2);

        // CA: packages/client-area/src/views/instance/advanced/WordpressUsers.vue:182
        $all = $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/users")->assertOk();
        // CA reads: packages/client-area/src/views/instance/advanced/WordpressUsers.vue:129 (every user outside the SSO picker)
        $all->assertJsonCount(2, 'data');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'for_sso'));
    }

    public function test_the_sso_picker_lists_every_user_without_a_restriction(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeTwoUsers();

        // CA: packages/client-area/src/mixins/OpenModalAction.js:26
        $sso = $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/users?role=administrator&for_sso=1")->assertOk();
        // CA reads: packages/client-area/src/mixins/OpenModalAction.js:27-31 (the users to pick from)
        $sso->assertJsonCount(2, 'data');
    }

    public function test_sso_to_another_wordpress_user_is_refused_for_a_restricted_user(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->restrictSsoToUser(2);
        Http::fake();

        // CA: packages/client-area/src/components/modal/WpAdminSsoModal.vue:272 (`{user}`)
        $refused = $this->actingAs($user)->postJson("/api/projects/{$application->id}/sso-url", ['user' => '1']);
        // CA reads: packages/client-area/src/components/modal/WpAdminSsoModal.vue:290 (`Api.getErrorMessage(error)`)
        $refused->assertForbidden()->assertJsonPath('message', 'WordPress SSO is restricted to your assigned account.');
        Http::assertNothingSent();
    }

    public function test_wordpress_users_require_authentication(): void
    {
        // CA: packages/client-area/src/views/instance/advanced/WordpressUsers.vue:182
        $this->getJson('/api/projects/1/wordpress/users')->assertUnauthorized();
    }
}
