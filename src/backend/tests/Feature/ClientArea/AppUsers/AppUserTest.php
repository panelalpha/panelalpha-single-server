<?php

namespace Tests\Feature\ClientArea\AppUsers;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Application users (containers), backed by the Engine
 * E:/app/* endpoints.
 * @see packages/client-area/src/views/instance/advanced/Users.vue:175,364
 * @see Engine core/routes/api.php:357-372 (app/users/*, app/roles)
 */
class AppUserTest extends TestCase
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
        // App users are a container (DinD) feature.
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['details' => ['template' => 'dind']]),
        ]])]);
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        return Application::query()->where('engine_username', 'site1')->firstOrFail();
    }

    public function test_users_and_roles_lists(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/AppUserController.php:90 → AppUserController::index,
        // `{data:[{id,username,email,role}]}` (core/app/System/Project/Dind/AppManager.php:25).
        // Engine: core/app/Http/Controllers/User/AppUserController.php:346 → AppUserController::roles
        Http::fake([
            'engine.example.com/api/projects/site1/app/users' => Http::response(['data' => [
                ['id' => '1', 'username' => 'admin', 'email' => 'admin@example.com', 'role' => 'administrator'],
            ]]),
            'engine.example.com/api/projects/site1/app/roles' => Http::response(['data' => ['admin', 'user']]),
        ]);

        // CA: src/views/instance/advanced/Users.vue:175
        // CA reads: src/views/instance/advanced/Users.vue:131,137,143 (`username`, `email`, `role`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/users")
            ->assertOk()
            ->assertJsonPath('data.0.id', '1')
            ->assertJsonPath('data.0.username', 'admin')
            ->assertJsonPath('data.0.email', 'admin@example.com')
            ->assertJsonPath('data.0.role', 'administrator');

        // CA: src/views/instance/advanced/Users.vue:256
        // CA reads: src/views/instance/advanced/Users.vue:257
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/users-roles")
            ->assertOk()
            ->assertJsonPath('data.1', 'user');
    }

    public function test_create_user_maps_username_to_login(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/AppUserController.php:117 -> AppUserController::store
        Http::fake(['engine.example.com/api/projects/site1/app/users' => Http::response(['data' => ['id' => '2']], 201)]);

        // CA: src/views/instance/advanced/Users.vue:364
        // CA reads: src/views/instance/advanced/Users.vue:365
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/users", [
                'username' => 'editor',
                'email' => 'editor@example.com',
                'password' => 'Secret-Password1!',
                'role' => 'user',
            ])
            ->assertOk()
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/app/users')
            && $r['login'] === 'editor'
            && $r['role'] === 'user');
    }

    public function test_delete_user_and_sso_url(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/AppUserController.php:160 -> AppUserController::destroy
        // Engine: core/app/Http/Controllers/User/AppUserController.php:218 -> AppUserController::createSsoToken
        Http::fake([
            'engine.example.com/api/projects/site1/app/users/2' => Http::response(null, 204),
            'engine.example.com/api/projects/site1/app/users/2/sso*' => Http::response(['url' => 'https://app.example.com/sso/token']),
        ]);

        // CA: src/views/instance/advanced/Users.vue:494
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$application->id}/users/2")
            ->assertOk();

        // CA: src/components/modal/AppSsoModal.vue:269
        // CA reads: src/components/modal/AppSsoModal.vue:272
        $this->actingAs($user)
            ->postJson("/api/projects/{$application->id}/users/2/sso-url")
            ->assertOk()
            ->assertJsonPath('data.sso_url', 'https://app.example.com/sso/token');
    }

    public function test_reset_app_user_password_calls_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/AppUserController.php:187 → AppUserController::resetPassword,
        // `PUT app/users/{id}/password`, bare 204.
        Http::fake(['engine.example.com/api/projects/site1/app/users/2/password' => Http::response(null, 204)]);

        // The CA's reset modal posts the new password (Users.vue:436).
        // CA: src/views/instance/advanced/Users.vue:436 (`{password}`)
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/users/2/reset-password", ['password' => 'NewSecret1!'])
            ->assertOk();

        Http::assertSent(fn ($r) => $r->method() === 'PUT'
            && str_ends_with($r->url(), '/app/users/2/password')
            && $r['password'] === 'NewSecret1!');
    }

    public function test_app_users_require_authentication(): void
    {
        // CA: src/views/instance/advanced/Users.vue:175
        $this->getJson('/api/projects/1/users')->assertUnauthorized();
    }
}
