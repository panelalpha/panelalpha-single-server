<?php

namespace Tests\Feature\EngineClient;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The project lifecycle calls the Admin Area's services need:
 * `PUT /projects/{u}` (resource limits),
 * `PUT /projects/{u}/suspend` and `PUT /projects/{u}/unsuspend`
 * (core/routes/api.php:141-143 on develop). The Engine refuses a protected
 * project's suspend and its main-domain rename, never an unsuspend or a
 * limits-only update (`EnsureProjectNotProtected.php:46-47, :124`).
 */
final class ProjectsApiLifecycleTest extends TestCase
{
    use EngineFixtures;

    private function api(): ProjectsApi
    {
        return new ProjectsApi(new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::ENGINE, '1|test-token')));
    }

    public function test_update_sends_only_the_given_keys_and_returns_the_project(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:1330 -> update, core/app/Http/Resources/UserResource.php:26-48 -> toArray
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['details' => ['disk_space_limit' => 2048]])])]);

        $project = $this->api()->update(new EngineProject(1, 'site1', protected: true), ['disk_space_limit' => 2048, 'inodes_limit' => null]);

        $this->assertSame('site1', $project['username']);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT'
            && $request->url() === self::ENGINE.'/projects/site1'
            && $request->data() === ['disk_space_limit' => 2048, 'inodes_limit' => null]);
    }

    public function test_an_update_renaming_a_protected_project_is_refused_before_the_call(): void
    {
        Http::fake();

        $this->expectException(ProjectProtectedException::class);
        try {
            $this->api()->update(new EngineProject(1, 'site1', protected: true), ['domain' => 'new.example.com']);
        } finally {
            Http::assertNothingSent();
        }
    }

    public function test_suspend_and_unsuspend(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1424 -> suspend
            'engine.example.com/api/projects/site1/suspend' => Http::response(['data' => $this->engineProject(10, 'site1', ['status' => 'suspended']), 'reload_pending' => false]),
            // Engine: core/app/Http/Controllers/UserController.php:1467 -> unsuspend
            'engine.example.com/api/projects/site1/unsuspend' => Http::response(['data' => $this->engineProject(10, 'site1', ['status' => 'active']), 'reload_pending' => false]),
        ]);

        $this->assertSame('suspended', $this->api()->suspend(new EngineProject(1, 'site1'))['status']);
        $this->assertSame('active', $this->api()->unsuspend(new EngineProject(1, 'site1', protected: true))['status']);

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT' && $request->url() === self::ENGINE.'/projects/site1/suspend');
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT' && $request->url() === self::ENGINE.'/projects/site1/unsuspend');
    }

    public function test_a_protected_project_is_not_suspended(): void
    {
        Http::fake();

        $this->expectException(ProjectProtectedException::class);
        try {
            $this->api()->suspend(new EngineProject(1, 'site1', protected: true));
        } finally {
            Http::assertNothingSent();
        }
    }
}
