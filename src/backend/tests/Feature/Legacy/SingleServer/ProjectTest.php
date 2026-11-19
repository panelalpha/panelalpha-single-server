<?php

namespace Tests\Feature\Legacy\SingleServer;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\VirtualService;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Ported from packages/api/tests/Feature/SingleServer/ProjectTest.php. The old
 * `Service::findSingleServerDefaultService()`,
 * `Server::findSingleServerEngine()`, the `getCache`/`setCache` cross-file
 * ordering and the `@depends` chains are replaced by v1's virtual service,
 * `syncedApplication()`/`User::factory()` fixtures and Engine fakes; the
 * requests and the response assertions stay as written.
 *
 * The WordPress install (`POST /projects/install`) answers the old 201 with
 * the new project (packages/api/tests/Feature/SingleServer/ProjectTest.php:30-38)
 * since Engine 2.2.0; its Engine calls run in the queued install job
 * (InstallWordPressTest), so the request adds none after the domain step.
 *
 * The classic WordPress staging (`POST /projects/{id}/staging`) answers the
 * old 201 with the staging (packages/api/tests/Feature/SingleServer/ProjectTest.php:44-63)
 * since Engine 2.2.0: the Engine copy points it at its own database and host.
 */
class ProjectTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_create_wordpress_project(): void
    {
        // Legacy: ProjectTest.php:13 skipIfCached('wordpress_project') → each test is self-contained (RefreshDatabase).
        // Legacy: ProjectTest.php:15 authSingleServer() → actingAs($user).
        $user = User::factory()->create();
        \Illuminate\Support\Facades\Queue::fake();

        // Legacy: ProjectTest.php:17-24 Service::findSingleServerDefaultService(), Server::findSingleServerEngine()
        // and the IP-derived `…sslip.io` domain → v1's virtual service id and a fixed fixture domain.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :300 -> projects storeAsync
        Http::fake([
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'test-wordpress-project']], 202),
        ]);
        $domainName = 'test-wordpress-project.example.com';

        // Legacy: ProjectTest.php:25-27 domain-step create kept verbatim.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        $response = $this->actingAs($user)->postJson('/api/services/'.VirtualService::ID.'/domains', [
            'domain' => $domainName,
        ]);
        $domainId = $response->json('data.id');
        assert(is_int($domainId));

        // The domain step's Engine calls; the install adds none.
        $sentBeforeInstall = count(Http::recorded());

        // Legacy: ProjectTest.php:30-33 install request kept verbatim.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605 (Api.post('/instances/install', …))
        $response = $this->actingAs($user)->postJson('/api/projects/install', [
            'service_id' => VirtualService::ID,
            'domain_id' => $domainId,
        ]);

        // Legacy: ProjectTest.php:34 assertStatus(201) kept (Engine 2.2.0).
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1616-1621 (response.data.data)
        $response->assertStatus(201)->assertJsonPath('data.id', $domainId)->assertJsonPath('data.async_status.installation', 'in_progress');
        \Illuminate\Support\Facades\Queue::assertPushed(\PanelAlpha\ClientArea\Jobs\WordPress\InstallWordPressJob::class);
        $this->assertCount($sentBeforeInstall, Http::recorded());
    }

    public function test_create_wordpress_staging(): void
    {
        // Legacy: ProjectTest.php:41-42 @depends test_create_wordpress_project and
        // ProjectTest.php:46 getCache('wordpress_project') → a self-contained
        // syncedApplication fixture (the classic WordPress project the old install
        // no longer creates).
        $user = User::factory()->create();
        $project = $this->syncedApplication($user, 'site1');
        $project->update(['type' => Application::TYPE_WORDPRESS]);

        // The copy is followed by a queued watcher.
        Queue::fake();
        // Engine: core/app/Http/Controllers/User/StagingController.php:58 -> StagingController::staging
        Http::fake(['engine.example.com/api/projects/site1/staging' => Http::response(['data' => [
            'id' => 50,
            'username' => 'site1-staging',
            'name' => '(staging) Site1',
            'domain' => 'staging.'.$project->domain,
            'status' => 'pending',
            'staging_of' => 'site1',
            'staging' => null,
            'details' => ['async_status' => ['staging' => 'in_progress']],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ], 'task_id' => 7], 202)]);

        // Legacy: ProjectTest.php:56-58 request kept verbatim.
        // CA: packages/client-area/src/components/modal/CreateStagingModal.vue:307
        $response = $this->actingAs($user)->postJson("/api/projects/{$project->id}/staging", [
            'domain' => 'staging.'.$project->domain,
        ]);

        // Legacy: ProjectTest.php:59 assertStatus(201) and :61 the staging in `data`.
        $response->assertStatus(201);
        $staging = $response->json('data');
        $this->assertIsArray($staging);
        $this->assertSame(1, Application::query()->where('staging_of_id', $project->id)->count());
    }

    public function test_create_wordpress_backup(): void
    {
        // Legacy: ProjectTest.php:67 @depends test_create_wordpress_project and
        // ProjectTest.php:73 getCache('wordpress_project') → a self-contained
        // syncedApplication fixture.
        $user = User::factory()->create();
        $project = $this->syncedApplication($user, 'site1');
        $project->update(['type' => Application::TYPE_WORDPRESS]);

        // The Engine copy task is watched by a queued job; sync in phpunit.xml.
        Queue::fake();
        // Engine: core/app/Http/Controllers/BackupContainerController.php:35 -> BackupContainerController::index
        // Engine: core/app/Http/Controllers/User/BackupController.php:105 -> BackupController::store (202 + BackupResource)
        Http::fake([
            'engine.example.com/api/backup-containers' => Http::response(['data' => [
                ['id' => 3, 'name' => 'local', 'driver' => 'local', 'location' => '/var/backups', 'has_credentials' => false],
            ]]),
            'engine.example.com/api/projects/site1/backups' => Http::response(['data' => $this->engineBackup(5, [
                'async_status' => ['backup' => 'pending', 'source' => 'api', 'task_id' => 7],
            ])], 202),
        ]);

        // Legacy: ProjectTest.php:79-82 request kept verbatim.
        // CA: packages/client-area/src/mixins/BackupActionsMixin.js:244
        $response = $this->actingAs($user)->postJson("/api/projects/{$project->id}/wordpress/backups", [
            'backupDirectory' => true,
            'backupDatabase' => false,
        ]);

        // Legacy: ProjectTest.php:83 assertStatus(200) kept (the Engine has
        // classic backups); the old `assert(is_array($backup))` at :86 stays.
        $response->assertStatus(200);
        $this->assertIsArray($response->json('data'));
        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/projects/site1/backups')
            && $request['files'] === true
            && $request['databases'] === false);
    }

    /**
     * One `GET backups` row (Engine `BackupResource`), shared by the create and
     * delete assertions (BackupTest.php:52).
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
