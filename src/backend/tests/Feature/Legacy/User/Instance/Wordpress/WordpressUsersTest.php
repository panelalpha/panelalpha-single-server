<?php

namespace Tests\Feature\Legacy\User\Instance\Wordpress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Ported from
 * packages/api/tests/Feature/User/Instance/Wordpress/WordpressUsersTest.php.
 * The old `authAsUser(1)` and the Plesk-only provider row become one v1 Engine project
 * fixture; the old `/api/instances/...` path is the CA's axios call, rewritten
 * to `/api/projects/...` in single-server mode.
 */
class WordpressUsersTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function wordpressApplication(User $user): Application
    {
        // Legacy: WordpressUsersTest.php:40 authAsUser(1) → actingAs($user); the
        // `dataProvider` row at :21-23 is a pure old fixture id → one v1 Engine
        // project fixture.
        $application = $this->syncedApplication($user, 'wpsite');
        // WordPress endpoints require a detected WordPress project.
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        return $application;
    }

    public function test_list_wordpress_users(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:75
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users*' => Http::response(['data' => [
            ['ID' => 1, 'user_login' => 'admin', 'user_email' => 'admin@example.com', 'display_name' => 'Admin', 'roles' => ['administrator'], 'user_registered' => '2026-01-01 00:00:00'],
        ]])]);

        // Legacy: WordpressUsersTest.php:41 request kept (GET).
        // CA: packages/client-area/src/views/instance/advanced/WordpressUsers.vue:182
        // CA reads: packages/client-area/src/views/instance/advanced/WordpressUsers.vue:182
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/users")
            ->assertStatus(200)
            ->assertJsonPath('data.0.username', 'admin');
    }

    public function test_list_wordpress_users_with_role_filter(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:75
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users*' => Http::response(['data' => [
            ['ID' => 1, 'user_login' => 'admin', 'user_email' => 'admin@example.com', 'display_name' => 'Admin', 'roles' => ['administrator'], 'user_registered' => '2026-01-01 00:00:00'],
        ]])]);

        // Legacy: WordpressUsersTest.php:54 request kept (GET ?role=administrator).
        // CA: packages/client-area/src/views/instance/advanced/WordpressUsers.vue:182
        // CA reads: packages/client-area/src/views/instance/advanced/WordpressUsers.vue:182
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/users?role=administrator")
            ->assertStatus(200)
            ->assertJsonPath('data.0.role', ['administrator']);

        // The CA's `role` reaches the Engine as `role`.
        Http::assertSent(fn ($request) => ($request['role'] ?? null) === 'administrator');
    }

    public function test_create_wordpress_user(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:140
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users' => Http::response(['data' => ['user' => 'editor']])]);

        // Legacy: WordpressUsersTest.php:66-70 faker username/email/name/password
        // + role → fixed v1 fixture; the faker password does not satisfy the
        // `Password::defaults()` rule the v1 create request enforces.
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:163
        // CA reads: packages/client-area/src/mixins/UsersActionsMixin.js:163
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/users", [
                'username' => 'editor',
                'email' => 'editor@example.com',
                'display_name' => 'Editor',
                'password' => 'Secret-Password1!',
                'role' => 'editor',
            ])
            ->assertStatus(200)
            ->assertJson(['success' => true]);
    }

    public function test_create_wordpress_user_with_send_email(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:140
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users' => Http::response(['data' => ['user' => 'author']])]);

        // Legacy: WordpressUsersTest.php:94-107 faker fields + send_email:true →
        // fixed v1 fixture; the faker password → a `Password::defaults()`-valid fixture.
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:163
        // CA reads: packages/client-area/src/mixins/UsersActionsMixin.js:163
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/wordpress/users", [
                'username' => 'author',
                'email' => 'author@example.com',
                'display_name' => 'Author',
                'password' => 'Secret-Password1!',
                'role' => 'author',
                'send_email' => true,
            ])
            ->assertStatus(200)
            ->assertJson(['success' => true]);
    }

    public function test_update_wordpress_user(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:195
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users/1' => Http::response(['data' => []])]);

        // Legacy: WordpressUsersTest.php:123-133 request kept (PUT users/1 with
        // the old email/display_name/role body).
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:274
        // CA reads: packages/client-area/src/mixins/UsersActionsMixin.js:274
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/users/1", [
                'email' => 'editor@example.com',
                'display_name' => 'Editor',
                'role' => 'contributor',
            ])
            ->assertStatus(200)
            ->assertJson(['success' => true]);
    }

    public function test_update_wordpress_user_with_password(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:195
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users/1' => Http::response(['data' => []])]);

        // Legacy: WordpressUsersTest.php:148-160 request kept (PUT users/1 with
        // the old password/email/display_name/role body); the update keeps the old
        // `nullable|string|max:255` rule, so a weak password is accepted (V15/V21).
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:274
        // CA reads: packages/client-area/src/mixins/UsersActionsMixin.js:274
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/wordpress/users/1", [
                'email' => 'editor@example.com',
                'display_name' => 'Editor',
                'password' => 'weakpass',
                'role' => 'subscriber',
            ])
            ->assertStatus(200)
            ->assertJson(['success' => true]);
    }

    public function test_delete_wordpress_user(): void
    {
        $user = User::factory()->create();
        $application = $this->wordpressApplication($user);

        // Engine: core/app/Http/Controllers/User/Wp/WpUserController.php:257
        Http::fake(['engine.example.com/api/projects/wpsite/wp/users/test%40example.com' => Http::response(['data' => ['user' => 'test@example.com', 'message' => "Success: Deleted user 'test'."]])]);

        // Legacy: WordpressUsersTest.php:178 request kept (DELETE by the CA email,
        // which the Engine accepts as `{user}`).
        // CA: packages/client-area/src/mixins/UsersActionsMixin.js:41
        // CA reads: packages/client-area/src/mixins/UsersActionsMixin.js:41
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/wordpress/users/test@example.com")
            ->assertStatus(200)
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/wp/users/test%40example.com'));
    }
}
