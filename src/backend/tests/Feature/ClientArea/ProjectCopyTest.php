<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\ClientArea\Contracts\CommunityPanel;
use PanelAlpha\ClientArea\Jobs\Application\CopyProjectJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * POST /projects/{id}/copy (old CopyInstanceController::store).
 *
 * Contract:
 * - CA: `Api.post('/instances/{id}/copy', {service_id, ...user_configurable_options})`
 *   and ignores the body (`packages/client-area/src/views/instance/advanced/CopyInstance.vue:235`);
 *   it waits for `user.instance.installation_finished|failed` with the new
 *   instance (`packages/client-area/src/apis/Auth.js:373,378`; old
 *   `CopyInstanceController` dispatched `InstallInstance`).
 * - Engine: `POST projects/{u}/clone` (core/routes/api.php:146 → UserController::clone)
 *   is synchronous and answers the new project's UserResource. It can fail the
 *   whole clone with a `ProblemException::deploy` (422).
 */
class ProjectCopyTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * Copy Project is a paid-panel route: the Community panel refuses it (the page is
     * hidden there since 2026-10-28). The rest of this suite tests
     * the Engine/queue contract that the paid editions keep, so it runs as a
     * non-Community panel; {@see test_copy_is_refused_on_the_community_panel} restores the
     * Community answer.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->app->instance(CommunityPanel::class, new class implements CommunityPanel
        {
            public function active(): bool
            {
                return false;
            }
        });
    }

    private function source(User $user, bool $custom = true): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
        ]])]);
        // CA: src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        $source = Application::query()->where('engine_username', 'site1')->firstOrFail();

        if ($custom) {
            $source->update(['type' => Application::TYPE_CUSTOM]);
        }

        return $source;
    }

    /**
     * @return array<string, mixed>
     */
    private function clonePayload(): array
    {
        return ['data' => [
            'id' => 99,
            'username' => 'site1-clone',
            'name' => 'Site1',
            'domain' => 'copied-1234-site1.example.com',
            'status' => 'active',
            'staging_of' => null,
            'staging' => null,
            'details' => [],
            'config' => [],
            'created_at' => '2026-10-10T00:00:00.000000Z',
        ]];
    }

    public function test_copy_queues_the_engine_clone(): void
    {
        $user = User::factory()->create();
        $source = $this->source($user);

        Queue::fake();
        Http::fake();

        $this->actingAs($user)
        // CA: src/views/instance/advanced/CopyInstance.vue:235
            ->postJson("/api/projects/{$source->id}/copy", ['service_id' => 1])
            ->assertStatus(202)
        // CA reads: src/apis/Instances.js:17
            ->assertJson(['success' => true]);

        Queue::assertPushed(CopyProjectJob::class, fn (CopyProjectJob $job) => $job->applicationId === $source->id);
        // The synchronous Engine clone must not run on the request path.
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/clone'));
    }

    public function test_the_clone_job_passes_the_long_engine_timeout(): void
    {
        $user = User::factory()->create();
        $source = $this->source($user);

        Notification::fake();
        $spy = $this->spyEngineTimeout($source);
        // Engine: core/app/Http/Controllers/UserController.php:1099 -> UserController::clone
        Http::fake(['engine.example.com/api/projects/site1/clone' => Http::response($this->clonePayload())]);

        $job = new CopyProjectJob($source->id);
        $job->handle(app(ApplicationSynchronizer::class));

        // The Engine clone is a synchronous rsync: the client must get the long
        // per-call timeout, and the job must outlive it on the long connection.
        $this->assertSame(EngineClient::LONG_TIMEOUT_SECONDS, $spy->requestedTimeout);
        $this->assertSame('database-long', $job->connection);
        $this->assertSame(1, $job->tries);
        $this->assertGreaterThan(EngineClient::LONG_TIMEOUT_SECONDS, $job->timeout);
    }

    /**
     * A classic clone copies the source's databases
     * explicitly (`copy_databases: true`), as the old panel did, so a future
     * Engine default cannot leave the clone on the live database.
     */
    public function test_the_clone_job_sends_copy_databases(): void
    {
        $user = User::factory()->create();
        $source = $this->source($user);

        Notification::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1099 -> UserController::clone
        Http::fake(['engine.example.com/api/projects/site1/clone' => Http::response($this->clonePayload())]);

        (new CopyProjectJob($source->id))->handle(app(ApplicationSynchronizer::class));

        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/projects/site1/clone')
            && ($r['copy_databases'] ?? null) === true);
    }

    public function test_the_clone_job_mirrors_the_new_project_and_notifies_finished(): void
    {
        $user = User::factory()->create();
        $source = $this->source($user);

        Notification::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1099 -> UserController::clone
        Http::fake(['engine.example.com/api/projects/site1/clone' => Http::response($this->clonePayload())]);

        (new CopyProjectJob($source->id))->handle(app(ApplicationSynchronizer::class));

        $clone = Application::query()->where('engine_username', 'site1-clone')->firstOrFail();
        $this->assertNotNull($clone->panel_created_at, 'the copy is a project this panel created');
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.installation_finished'
            && $n->application->id === $clone->id);
    }

    public function test_the_clone_job_notifies_failed_with_the_engine_error(): void
    {
        $user = User::factory()->create();
        $source = $this->source($user);

        Notification::fake();
        // ProblemException::deploy (UserController::clone) → 422 with problems.
        // Engine: core/app/Http/Controllers/UserController.php:1099 -> UserController::clone
        Http::fake(['engine.example.com/api/projects/site1/clone' => Http::response([
            'message' => 'clone failed',
            'problems' => [['rule' => 'clone_failed', 'message' => 'rsync failed']],
        ], 422)]);

        (new CopyProjectJob($source->id))->handle(app(ApplicationSynchronizer::class));

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.installation_failed'
            && $n->application->id === $source->id);
        $this->assertSame(0, Application::query()->where('engine_username', 'site1-clone')->count());
    }

    public function test_the_clone_job_notifies_failed_when_the_engine_is_down(): void
    {
        $user = User::factory()->create();
        $source = $this->source($user);

        Notification::fake();
        Http::fake(fn () => throw new ConnectionException('Engine down'));

        (new CopyProjectJob($source->id))->handle(app(ApplicationSynchronizer::class));

        // A transport failure ends the CA spinner with the failed type; it must
        // not crash the worker.
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.installation_failed'
            && $n->application->id === $source->id
            && $n->isError === true);
    }

    public function test_the_clone_job_failed_hook_always_notifies(): void
    {
        $user = User::factory()->create();
        $source = $this->source($user);

        Notification::fake();

        (new CopyProjectJob($source->id))->failed();

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->type === 'user.instance.installation_failed'
            && $n->application->id === $source->id
            && $n->isError === true
            && ($n->payload['message'] ?? null) === 'The copy did not finish.');
    }

    public function test_copy_is_refused_on_the_community_panel(): void
    {
        $this->app->instance(CommunityPanel::class, new class implements CommunityPanel
        {
            public function active(): bool
            {
                return true;
            }
        });

        $user = User::factory()->create();
        $source = $this->source($user);

        Queue::fake();

        // CA: packages/client-area/src/views/instance/advanced/CopyInstance.vue:235 (`Api.post('/instances/{id}/copy', ...)`)
        $this->actingAs($user)
            ->postJson("/api/projects/{$source->id}/copy", ['service_id' => 1])
            ->assertStatus(403)
            // CA reads: packages/client-area/src/mixins/InstanceActionsMixin.js:725 (the copy failure alert)
            ->assertJson(['message' => 'Copying a project is not available in Single Server Community.']);

        Queue::assertNotPushed(CopyProjectJob::class);
    }

    public function test_copy_requires_the_service_flag(): void
    {
        $user = User::factory()->create();
        $source = $this->source($user);

        Queue::fake();

        $this->actingAs($user)
        // CA: src/views/instance/advanced/CopyInstance.vue:235
            ->postJson("/api/projects/{$source->id}/copy", [])
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonValidationErrors(['service_id']);

        Queue::assertNotPushed(CopyProjectJob::class);
    }

    public function test_copy_rejects_an_unknown_service_id(): void
    {
        $user = User::factory()->create();
        $source = $this->source($user);

        Queue::fake();

        $this->actingAs($user)
        // CA: src/views/instance/advanced/CopyInstance.vue:235
            ->postJson("/api/projects/{$source->id}/copy", ['service_id' => 999])
            ->assertStatus(422)
        // CA reads: src/apis/Instances.js:17
            ->assertJsonValidationErrors(['service_id']);

        Queue::assertNotPushed(CopyProjectJob::class);
    }

    public function test_copy_requires_authentication(): void
    {
        // CA: src/views/instance/advanced/CopyInstance.vue:235
        $this->postJson('/api/projects/1/copy', ['service_id' => 1])->assertUnauthorized();
    }

    /**
     * The source kinds the panel used to refuse: since Engine 2.2.0 the
     * clone points a copied WordPress at its own database and host, and the Engine reads `wp-config.php` itself, so an undetected
     * source is copied too.
     *
     * @return array<string, array{?string}>
     */
    public static function kindsTheEngineNowCopies(): array
    {
        return [
            'classic WordPress' => [Application::TYPE_WORDPRESS],
            'undetected' => [null],
        ];
    }

    #[DataProvider('kindsTheEngineNowCopies')]
    public function test_copy_queues_the_clone_for_every_project_kind(?string $type): void
    {
        $user = User::factory()->create();
        $source = $this->source($user);
        $source->update(['type' => $type]);

        Queue::fake();

        $this->actingAs($user)
        // CA: src/views/instance/advanced/CopyInstance.vue:235
            ->postJson("/api/projects/{$source->id}/copy", ['service_id' => 1])
            ->assertStatus(202);

        Queue::assertPushed(CopyProjectJob::class, fn (CopyProjectJob $job) => $job->applicationId === $source->id);
    }

    public function test_container_wordpress_copy_still_queues_the_clone(): void
    {
        $user = User::factory()->create();
        $source = $this->source($user);
        $source->update(['type' => Application::TYPE_WORDPRESS, 'engine_payload' => ['details' => ['template' => 'dind']]]);

        Queue::fake();

        $this->actingAs($user)
        // CA: src/views/instance/advanced/CopyInstance.vue:235
            ->postJson("/api/projects/{$source->id}/copy", ['service_id' => 1])
            ->assertStatus(202);

        Queue::assertPushed(CopyProjectJob::class);
    }
}
