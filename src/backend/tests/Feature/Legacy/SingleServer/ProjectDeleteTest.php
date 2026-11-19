<?php

namespace Tests\Feature\Legacy\SingleServer;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Ported from packages/api/tests/Feature/SingleServer/ProjectDeleteTest.php.
 * The old `getCache`/`setCache` cross-file
 * ordering and the `@depends` chains into `ProjectTest` are replaced by v1
 * `syncedApplication()`/fixture rows and Engine fakes; the requests and the
 * response assertions stay as written. All three methods are ported.
 */
class ProjectDeleteTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_delete_wordpress_project(): void
    {
        // Legacy: ProjectDeleteTest.php:10 @depends test_create_wordpress_project and
        // :14 getCache('wordpress_project') → a self-contained syncedApplication fixture.
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1');

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(null, 204)]);

        // Legacy: ProjectDeleteTest.php:17-20 request kept verbatim.
        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:386
        $response = $this->actingAs($user)->deleteJson("/api/projects/{$application->id}", [
            'remove_data' => true,
            'remove_database' => true,
            'confirm' => true,
        ]);

        // Legacy: ProjectDeleteTest.php:21 assertStatus(200) kept; the old
        // unsetCache('wordpress_project') at :22 is dropped (no cross-file cache).
        $response->assertStatus(200);
        Http::assertSent(fn ($request): bool => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/api/projects/site1'));
    }

    public function test_delete_wordpress_staging(): void
    {
        // Legacy: ProjectDeleteTest.php:25 @depends test_create_wordpress_staging and
        // :30 getCache('wordpress_staging') → a self-contained staging fixture on a
        // synced parent.
        $user = User::factory()->create();
        $parent = $this->syncedApplication($user, 'site1');
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'type' => Application::TYPE_WORDPRESS,
            'staging_of_id' => $parent->id,
        ]);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(null, 204)]);

        // Legacy: ProjectDeleteTest.php:33 request, plus the acknowledgements the DELETE requires now.
        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:386
        $response = $this->actingAs($user)->deleteJson("/api/projects/{$staging->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true]);

        // Legacy: ProjectDeleteTest.php:34 assertStatus(200) kept; the old
        // unsetCache('wordpress_staging') at :35 is dropped (no cross-file cache).
        $response->assertStatus(200);
        Http::assertSent(fn ($request): bool => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/api/projects/site1-staging'));
    }

    public function test_delete_wordpress_backup(): void
    {
        // Legacy: ProjectDeleteTest.php:39 @depends test_create_wordpress_staging and
        // :43-46 getCache('wordpress_project')/getCache('wordpress_backup') →
        // self-contained fixtures.
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1');
        $backupId = 5;

        // The Engine delete task is watched by a queued job; sync in phpunit.xml.
        Queue::fake();
        // Engine: core/app/Http/Controllers/User/BackupController.php:162 -> BackupController::show
        // Engine: core/app/Http/Controllers/User/BackupController.php:268 -> BackupController::destroy (202)
        Http::fake([
            'engine.example.com/api/projects/site1/backups/'.$backupId => function ($request) use ($backupId) {
                if ($request->method() === 'DELETE') {
                    // Engine: core/app/Http/Controllers/User/BackupController.php:268 -> BackupController::destroy (202)
                    return Http::response(['data' => $this->engineBackup($backupId, [
                        'async_status' => ['delete' => 'pending', 'task_id' => 9],
                    ])], 202);
                }

                // Engine: core/app/Http/Controllers/User/BackupController.php:162 -> BackupController::show
                return Http::response(['data' => $this->engineBackup($backupId)]);
            },
        ]);

        // Legacy: ProjectDeleteTest.php:48 request kept verbatim.
        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:59
        $response = $this->actingAs($user)->deleteJson("/api/projects/{$application->id}/wordpress/backups/{$backupId}");

        // Legacy: ProjectDeleteTest.php:49 assertStatus(200) kept;
        // the old unsetCache('wordpress_backup') at :50 is dropped.
        $response->assertStatus(200);
        Http::assertSent(fn ($request): bool => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/api/projects/site1/backups/'.$backupId));
    }

    /**
     * One `GET backups` row (Engine `BackupResource`), shared by the show and
     * delete stubs (BackupTest.php:52).
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function engineBackup(int $id = 5, array $overrides = []): array
    {
        // Engine: core/app/Http/Resources/BackupResource.php:12 -> BackupResource::toArray
        return array_merge([
            'id' => $id,
            'username' => 'site1',
            'container_id' => 1,
            'kind' => 'manual',
            'note' => 'Before update',
            'contents' => ['files' => true, 'databases' => true],
            'async_status' => ['backup' => 'completed', 'source' => 'api'],
            'error' => null,
            'size_bytes' => 2048,
            'created_at' => '2026-10-10T12:00:00.000000Z',
            'updated_at' => '2026-10-10T12:05:00.000000Z',
            'items' => [],
        ], $overrides);
    }
}
