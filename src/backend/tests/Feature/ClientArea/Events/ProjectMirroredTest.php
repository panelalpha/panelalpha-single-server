<?php

namespace Tests\Feature\ClientArea\Events;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\ClientArea\Events\ProjectMirrored;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The synchronizer announces every mirrored row through ProjectMirrored, with
 * the `created` flag (the Connect AI scopes follow a new row).
 *
 * `Event::fake` is only used here (the new firing tests), never in the
 * behaviour tests.
 *
 * @see src/Sync/ApplicationSynchronizer.php
 * @see Engine core/routes/api.php:141 (GET /projects/all)
 */
class ProjectMirroredTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_sync_announces_project_mirrored(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fakeSequence('engine.example.com/api/projects/all*')
            ->push(['data' => [$this->engineProject(10, 'site1')]])
            ->push(['data' => [$this->engineProject(10, 'site1', ['status' => 'suspended'])]]);

        Event::fake([ProjectMirrored::class]);

        $synchronizer = app(ApplicationSynchronizer::class);
        $synchronizer->sync(EngineConnection::DEFAULT_ID);

        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();
        Event::assertDispatched(
            ProjectMirrored::class,
            fn (ProjectMirrored $event): bool => $event->applicationId === $application->id && $event->created === true,
        );

        Event::fake([ProjectMirrored::class]);
        $synchronizer->sync(EngineConnection::DEFAULT_ID);

        Event::assertDispatched(
            ProjectMirrored::class,
            fn (ProjectMirrored $event): bool => $event->applicationId === $application->id && $event->created === false,
        );
    }

    public function test_mirror_announces_project_mirrored(): void
    {
        $this->configureEngine();

        Event::fake([ProjectMirrored::class]);

        $synchronizer = app(ApplicationSynchronizer::class);
        $application = $synchronizer->mirror(EngineConnection::DEFAULT_ID, $this->engineProject(10, 'site1'));
        $this->assertNotNull($application);

        Event::assertDispatched(
            ProjectMirrored::class,
            fn (ProjectMirrored $event): bool => $event->applicationId === $application->id && $event->created === true,
        );

        // A second mirror is an update: ProjectMirrored carries created=false.
        Event::fake([ProjectMirrored::class]);
        $synchronizer->mirror(EngineConnection::DEFAULT_ID, $this->engineProject(10, 'site1'));

        Event::assertDispatched(
            ProjectMirrored::class,
            fn (ProjectMirrored $event): bool => $event->applicationId === $application->id && $event->created === false,
        );
    }

    public function test_a_numeric_username_is_still_announced_as_created(): void
    {
        // A numeric Engine username becomes an int array key in the sync's
        // `inserted` list; the row must still be reported as created.
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, '12345'),
        ]])]);

        Event::fake([ProjectMirrored::class]);

        app(ApplicationSynchronizer::class)->sync(EngineConnection::DEFAULT_ID);

        $application = Application::query()->where('engine_username', '12345')->firstOrFail();
        Event::assertDispatched(
            ProjectMirrored::class,
            fn (ProjectMirrored $event): bool => $event->applicationId === $application->id && $event->created === true,
        );
    }
}
