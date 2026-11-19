<?php

namespace Tests\Feature\Legacy\User\ServerAccount\Instance;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Ported from
 * packages/api/tests/Feature/User/ServerAccount/Instance/EnvFileControllerTest.php.
 * The old `User::first` +
 * `ServerAccount::where(...)` lookups are replaced by v1's synced Application
 * fixtures; the requests and the response assertions stay as written.
 */
class EnvFileControllerTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_show_requires_path(): void
    {
        // Legacy: EnvFileControllerTest.php:16-26 (User::first +
        // ServerAccount::where('user_id', ...)) → v1's synced Application fixture.
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // Legacy: EnvFileControllerTest.php:28 authAsUser → actingAs($user).
        // CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:355
        $response = $this->actingAs($user)->getJson(
            // Legacy: EnvFileControllerTest.php:30-32 request kept verbatim
            // (`/instances/0` literal instance id).
            "/api/server-accounts/{$application->id}/instances/0/env-file"
        );

        // Legacy: EnvFileControllerTest.php:34 assertStatus(422) kept; v1 answers
        // 422 on `path` (EnvFileRequest.php:18).
        $response->assertStatus(422);
        // CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:413
        $response->assertJsonValidationErrors('path');
    }

    public function test_update_rejects_wordpress_instances(): void
    {
        // Legacy: EnvFileControllerTest.php:39-64 (User::first + the WordPress
        // applications `version like wp%` lookup) → v1's Application::TYPE_WORDPRESS.
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        // Legacy: EnvFileControllerTest.php:66 authAsUser → actingAs($user).
        // CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
        $response = $this->actingAs($user)->putJson(
            // Legacy: EnvFileControllerTest.php:68-69 request path kept; in v1 the
            // account and the project are the same row, so both ids are the
            // application id (assertSameInstance, EnvFileController.php:66-70).
            "/api/server-accounts/{$application->id}/instances/{$application->id}/env-file",
            [
                // Legacy: EnvFileControllerTest.php:70-75 request kept verbatim.
                'path' => '.env',
                'mode' => 'raw',
                'contents' => "FOO=bar\n",
                'restart' => false,
            ]
        );

        // Legacy: EnvFileControllerTest.php:78-79 assertStatus(422) +
        // assertArrayHasKey('app_type') kept; v1 answers the old app_type error
        // (EnvFileService.php:345-348).
        $response->assertStatus(422);
        $this->assertArrayHasKey('app_type', $response->json('errors') ?? []);
    }

    public function test_update_validates_path_must_be_inside_home(): void
    {
        // Legacy: EnvFileControllerTest.php:84-111 (User::first + the non-WordPress
        // applications lookup) → v1's classic fixture: a classic save
        // writes the file, so it checks the path as the
        // old update() did (EnvFileService::resolvePath).
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        // Defensive (not an Engine shape): the path is refused before any Engine call.
        Http::fake(['engine.example.com/*' => Http::response(['success' => true])]);

        // Legacy: EnvFileControllerTest.php:113 authAsUser → actingAs($user).
        // CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
        $response = $this->actingAs($user)->putJson(
            // Legacy: EnvFileControllerTest.php:115-116 request path kept; in v1 the
            // account and the project are the same row.
            "/api/server-accounts/{$application->id}/instances/{$application->id}/env-file",
            [
                // Legacy: EnvFileControllerTest.php:117-122 request kept verbatim.
                'path' => '../../etc/passwd',
                'mode' => 'raw',
                'contents' => "FOO=bar\n",
                'restart' => false,
            ]
        );

        // Legacy: EnvFileControllerTest.php:125-126 assertStatus(422) +
        // assertArrayHasKey('path') kept; v1 answers 422 on `path`
        // (EnvFileService::resolvePath) before any Engine call.
        $response->assertStatus(422);
        $this->assertArrayHasKey('path', $response->json('errors') ?? []);
        Http::assertNothingSent();
    }
}
