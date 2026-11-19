<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\ClientArea\Events\ProjectDeletedByUser;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Jobs\Application\DeleteProjectJob;
use PanelAlpha\ClientArea\Models\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * DELETE /projects/{id} (Engine DELETE E:, 409 when busy).
 * @see packages/client-area/src/apis/Instances.js (delete)
 * @see Engine core/routes/api.php:155 (DELETE /projects/{username})
 */
class ProjectDeleteTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(User $user): Application
    {
        return $this->syncedApplication($user);
    }

    public function test_deletes_the_project_on_the_engine_and_locally(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1']])]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk()
        // CA reads: src/mixins/InstanceActionsMixin.js:387
            ->assertJson(['success' => true]);

        $this->assertDatabaseMissing('applications', ['id' => $application->id]);
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/projects/site1'));
    }

    public function test_deleting_a_project_tells_the_paid_admin_area(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1']])]);
        Event::fake([ProjectDeletedByUser::class]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        // The paid admin area's InstanceDeletedByUser follows this event.
        Event::assertDispatched(ProjectDeletedByUser::class, static fn (ProjectDeletedByUser $event): bool => $event->application->is($application));
    }

    public function test_delete_passes_the_long_engine_timeout(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The CA consumes the delete result in this response, so the call stays
        // synchronous but must get the long per-call timeout.
        $spy = $this->spyEngineTimeout($application);
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1']])]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        $this->assertSame(EngineClient::LONG_TIMEOUT_SECONDS, $spy->requestedTimeout);
        // Pin the literal too, so changing the constant fails here.
        $this->assertSame(1700, EngineClient::LONG_TIMEOUT_SECONDS);
    }

    public function test_a_failed_staging_whose_destination_exists_is_deleted_on_the_engine(): void
    {
        $user = User::factory()->create();
        $parent = $this->application($user);

        // A staging the synchronizer kept after its creation failed.
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'failed',
            'staging_of_id' => $parent->id,
            'staging_create_failed_at' => now(),
            'engine_payload' => ['details' => ['async_status' => ['staging' => 'failed']]],
        ]);

        // `async_status.staging = failed` does not prove the destination is
        // gone: the Engine marks the failure before it destroys the destination
        // (Jobs/CreateStaging.php:66-87), so the delete must still call the
        // Engine and treat its 404 as "already gone".
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
            'engine.example.com/api/projects/site1-staging' => function ($request) {
                // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
                if ($request->method() === 'GET') {
                    return Http::response(['data' => [
                        'username' => 'site1-staging',
                        'details' => ['async_status' => ['staging' => 'failed']],
                    ]]);
                }

                // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
                return Http::response(null, 404);
            },
        ]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$staging->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        $this->assertDatabaseMissing('applications', ['id' => $staging->id]);
        $this->assertDatabaseHas('applications', ['id' => $parent->id]);
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/projects/site1-staging'));
    }

    public function test_a_failed_staging_whose_destination_is_gone_is_deleted_locally(): void
    {
        $user = User::factory()->create();
        $parent = $this->application($user);

        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'failed',
            'staging_of_id' => $parent->id,
            'staging_create_failed_at' => now(),
        ]);

        // Only a `show` 404 proves the destination is already gone, so the row
        // is dropped without an Engine teardown.
        // Engine: core/app/Http/Controllers/UserController.php:1310 -> UserController::show
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(null, 404)]);

        // CA: src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$staging->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        $this->assertDatabaseMissing('applications', ['id' => $staging->id]);
        $this->assertDatabaseHas('applications', ['id' => $parent->id]);
        Http::assertNotSent(fn ($request) => $request->method() === 'DELETE');
    }

    /**
     * A `show` answer that is neither 200 nor 404 does not prove the destination
     * is gone (the Engine's show documents only 200/404); the delete must still
     * reach the Engine DELETE, whose 409 keeps the row.
     *
     * @return array<string, array{int}>
     */
    public static function showStatusesThatDoNotProveGone(): array
    {
        return [
            'forbidden' => [403],
            'conflict' => [409],
        ];
    }

    #[DataProvider('showStatusesThatDoNotProveGone')]
    public function test_a_failed_staging_whose_show_is_not_a_404_still_reaches_the_engine_delete(int $showStatus): void
    {
        $user = User::factory()->create();
        $parent = $this->application($user);

        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'failed',
            'staging_of_id' => $parent->id,
            'staging_create_failed_at' => now(),
        ]);

        Http::fake([
            'engine.example.com/api/projects/site1-staging' => function ($request) use ($showStatus) {
                if ($request->method() === 'GET') {
                    // Defensive (not an Engine shape): UserController::show documents only 200 and 404; a 403/409 is exercised to prove it never stands in for the proving 404.
                    return Http::response(['message' => 'Not allowed.'], $showStatus);
                }

                // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy (409 + ProjectBusyException)
                return Http::response(['message' => 'Project is busy'], 409);
            },
        ]);

        // CA: src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$staging->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertStatus(409);

        $this->assertDatabaseHas('applications', ['id' => $staging->id]);
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/projects/site1-staging'));
    }

    public function test_a_creating_staging_is_deleted_on_the_engine(): void
    {
        $user = User::factory()->create();
        $parent = $this->application($user);

        // A still-running copy has a destination on the Engine, so the delete
        // goes to the Engine; only a row the Engine already dropped is local.
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of_id' => $parent->id,
            'staging_creating_at' => now(),
        ]);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => ['username' => 'site1-staging']])]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$staging->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        $this->assertDatabaseMissing('applications', ['id' => $staging->id]);
        $this->assertDatabaseHas('applications', ['id' => $parent->id]);
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/projects/site1-staging'));
    }

    public function test_a_staging_whose_cap_ended_is_deleted_on_the_engine(): void
    {
        $user = User::factory()->create();
        $parent = $this->application($user);

        // The watcher's cap ended the creating marker without setting the
        // confirmed-failure marker, so the destination is
        // still on the Engine and the delete must go there.
        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'failed',
            'staging_of_id' => $parent->id,
            'staging_creating_at' => null,
            'staging_create_failed_at' => null,
        ]);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['data' => ['username' => 'site1-staging']])]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$staging->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        $this->assertDatabaseMissing('applications', ['id' => $staging->id]);
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/projects/site1-staging'));
    }

    public function test_a_creating_staging_delete_bubbles_the_engine_409(): void
    {
        $user = User::factory()->create();
        $parent = $this->application($user);

        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'pending',
            'staging_of_id' => $parent->id,
            'staging_creating_at' => now(),
        ]);

        // The Engine refuses to delete a project whose copy task is running; the
        // retry/delete menu must keep the row.
        // Engine: core/app/Http/Controllers/UserController.php:1525 -> UserController::destroy busy check
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['message' => 'The project is busy.'], 409)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$staging->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertStatus(409);

        $this->assertDatabaseHas('applications', ['id' => $staging->id]);
    }

    public function test_delete_removes_the_provider_webhook_too(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', [
            'details' => ['git_repo' => 'https://github.com/acme/site'],
        ]);
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        // The provider client validates the repository host first; fake the
        // guard so the test never resolves a name.
        $this->app->instance(HostGuard::class, new class implements HostGuard
        {
            public function assertAllowed(string $host): void {}

            public function allows(string $host): bool
            {
                return true;
            }

            public function validatedAddresses(string $host): array
            {
                return [$host];
            }
        });

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
            'engine.example.com/api/projects/site1' => Http::response(null, 204),
            // External: GitHub REST API DELETE /repos/{owner}/{repo}/hooks/{id}
            'api.github.com/*' => Http::response(null, 204),
        ]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        // The provider hook is the panel's to remove.
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && $request->url() === 'https://api.github.com/repos/acme/site/hooks/555');
    }

    public function test_delete_keeps_the_provider_webhook_when_the_engine_refuses(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', [
            'details' => ['git_repo' => 'https://github.com/acme/site'],
        ]);
        $application->forceFill([
            'git_token' => 'ghp_token',
            'git_provider' => 'github',
            'git_webhook_id' => '555',
        ])->save();

        $this->app->instance(HostGuard::class, new class implements HostGuard
        {
            public function assertAllowed(string $host): void {}

            public function allows(string $host): bool
            {
                return true;
            }

            public function validatedAddresses(string $host): array
            {
                return [$host];
            }
        });

        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
            'engine.example.com/api/projects/site1' => Http::response(['message' => 'busy'], 500),
            // External: GitHub REST API DELETE /repos/{owner}/{repo}/hooks/{id}
            'api.github.com/*' => Http::response(null, 204),
        ]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertStatus(502);

        // Persist-after-accept extends to third parties: the provider hook stays
        // until the Engine accepted the delete.
        Http::assertNotSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), 'api.github.com'));
        $this->assertDatabaseHas('applications', ['id' => $application->id]);
    }

    public function test_a_project_with_a_staging_is_refused_before_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Application::query()->create([
            'engine_id' => $application->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $application->id,
        ]);

        // The Engine would answer 500; the panel answers the old 422 with the
        // old text (messages.php:167).
        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertStatus(422)
        // CA reads: src/mixins/InstanceActionsMixin.js:387
            ->assertJsonPath('errors.0.0', 'Cannot remove instance with existing staging instance.');

        Http::assertNotSent(fn ($r) => $r->method() === 'DELETE');
        $this->assertDatabaseHas('applications', ['id' => $application->id]);
    }

    public function test_delete_with_all_three_acknowledgements_is_accepted(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(null, 204)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        $this->assertDatabaseMissing('applications', ['id' => $application->id]);
    }

    /** The dialog's third box is required too: an API client that leaves it out cannot delete a project. */
    public function test_delete_without_the_final_confirmation_is_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(null, 204)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true])
            ->assertStatus(422)
// CA reads: src/mixins/InstanceActionsMixin.js:387
            ->assertJsonValidationErrors('confirm');

        Http::assertNotSent(fn ($request) => $request->method() === 'DELETE');
        $this->assertDatabaseHas('applications', ['id' => $application->id]);
    }

    /** The Delete Staging dialog shows the same three boxes, so the staging delete needs them all. */
    public function test_a_staging_copy_delete_needs_the_final_confirmation(): void
    {
        $user = User::factory()->create();
        $parent = $this->application($user);

        $staging = Application::query()->create([
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
        ]);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(null, 204)]);

        // CA: src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$staging->id}", ['remove_data' => true, 'remove_database' => true])
            ->assertStatus(422)
// CA reads: src/mixins/InstanceActionsMixin.js:387
            ->assertJsonValidationErrors('confirm');

        Http::assertNotSent(fn ($request) => $request->method() === 'DELETE');
        $this->assertDatabaseHas('applications', ['id' => $staging->id]);

        // CA: src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)
            ->deleteJson("/api/projects/{$staging->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        $this->assertDatabaseMissing('applications', ['id' => $staging->id]);
        $this->assertDatabaseHas('applications', ['id' => $parent->id]);
    }

    public function test_engine_409_is_passed_through(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['message' => 'Project is busy'], 409)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertStatus(409);

        $this->assertDatabaseHas('applications', ['id' => $application->id]);
    }

    /** A busy delete asked to wait is accepted and left to DeleteProjectJob. */
    public function test_a_busy_delete_asked_to_defer_is_accepted_and_queued(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        Event::fake([ProjectDeletedByUser::class]);
        // Engine: core/app/Http/Controllers/UserController.php:1525 -> UserController::destroy busy check
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['message' => 'The project is busy.'], 409)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", [
                'remove_data' => true,
                'remove_database' => true,
                'confirm' => true,
                'defer_while_busy' => true,
            ])
            ->assertStatus(202)
        // CA reads: src/mixins/InstanceActionsMixin.js:387
            ->assertJson(['success' => true]);

        $this->assertDatabaseHas('applications', ['id' => $application->id]);
        Queue::assertPushed(DeleteProjectJob::class, fn (DeleteProjectJob $job): bool => $job->applicationId === $application->id);
        Event::assertNotDispatched(ProjectDeletedByUser::class);
    }

    public function test_the_defer_flag_does_not_change_a_delete_the_engine_accepts(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(null, 204)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", [
                'remove_data' => true,
                'remove_database' => true,
                'confirm' => true,
                'defer_while_busy' => true,
            ])
            ->assertOk()
        // CA reads: src/mixins/InstanceActionsMixin.js:387
            ->assertJson(['success' => true]);

        $this->assertDatabaseMissing('applications', ['id' => $application->id]);
        Queue::assertNotPushed(DeleteProjectJob::class);
    }

    public function test_the_defer_flag_only_defers_a_busy_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['message' => 'boom'], 500)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", [
                'remove_data' => true,
                'remove_database' => true,
                'confirm' => true,
                'defer_while_busy' => true,
            ])
            ->assertStatus(502);

        $this->assertDatabaseHas('applications', ['id' => $application->id]);
        Queue::assertNotPushed(DeleteProjectJob::class);
    }

    /** The three acknowledgements stay required: the flag only changes the busy answer. */
    public function test_the_defer_flag_does_not_bypass_the_acknowledgements(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['defer_while_busy' => true])
            ->assertStatus(422)
        // CA reads: src/mixins/InstanceActionsMixin.js:387
            ->assertJsonValidationErrors(['remove_data', 'remove_database', 'confirm']);

        Http::assertNotSent(fn ($request) => $request->method() === 'DELETE');
        Queue::assertNotPushed(DeleteProjectJob::class);
        $this->assertDatabaseHas('applications', ['id' => $application->id]);
    }

    public function test_an_unreachable_engine_is_503_and_keeps_the_mirror(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertStatus(503);

        $this->assertDatabaseHas('applications', ['id' => $application->id]);
    }

    public function test_engine_404_still_cleans_up_the_mirror(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['message' => 'Not found'], 404)]);

        $this->actingAs($user)
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        $this->assertDatabaseMissing('applications', ['id' => $application->id]);
    }

    public function test_delete_unknown_project_is_404(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        $this->actingAs(User::factory()->create())
        // CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson('/api/projects/999', ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertNotFound();
    }

    public function test_delete_requires_authentication(): void
    {
        // CA: src/mixins/InstanceActionsMixin.js:386
        $this->deleteJson('/api/projects/1', ['remove_data' => true, 'remove_database' => true, 'confirm' => true])->assertUnauthorized();
    }
}
