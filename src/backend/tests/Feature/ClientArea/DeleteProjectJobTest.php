<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Events\ProjectDeletedByUser;
use PanelAlpha\ClientArea\Jobs\Application\DeleteProjectJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectService;
use Tests\TestCase;

/** The delete a busy Engine left to DeleteProjectJob: polled on 409, backed off on a hiccup, capped. */
class DeleteProjectJobTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user): Application
    {
        return $this->syncedApplication($user);
    }

    private function runOnce(Application $application, int $startedAt = 0, int $hiccupAttempt = 0): void
    {
        (new DeleteProjectJob(
            $application->id,
            startedAt: $startedAt,
            hiccupAttempt: $hiccupAttempt,
        ))->handle(app(ProjectService::class));
    }

    public function test_it_removes_the_project_once_the_engine_lets_it_go(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        Event::fake([ProjectDeletedByUser::class]);
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(null, 204)]);

        $this->runOnce($application);

        $this->assertDatabaseMissing('applications', ['id' => $application->id]);
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/projects/site1'));
        Queue::assertNotPushed(DeleteProjectJob::class);
        Event::assertDispatched(ProjectDeletedByUser::class);
    }

    public function test_a_busy_project_is_polled_not_backed_off(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1525 -> UserController::destroy busy check
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['message' => 'The project is busy.'], 409)]);

        $this->runOnce($application);

        $this->assertDatabaseHas('applications', ['id' => $application->id]);
        Queue::assertPushed(DeleteProjectJob::class, fn (DeleteProjectJob $job): bool => $job->applicationId === $application->id
            && $job->hiccupAttempt === 0
            && $job->startedAt > 0);
    }

    public function test_an_engine_hiccup_backs_off(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['message' => 'boom'], 503)]);

        $this->runOnce($application);

        $this->assertDatabaseHas('applications', ['id' => $application->id]);
        Queue::assertPushed(DeleteProjectJob::class, fn (DeleteProjectJob $job): bool => $job->hiccupAttempt === 1);
    }

    public function test_an_unreachable_engine_backs_off(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        Http::fake(['engine.example.com/api/projects/site1' => Http::failedConnection()]);

        $this->runOnce($application);

        $this->assertDatabaseHas('applications', ['id' => $application->id]);
        Queue::assertPushed(DeleteProjectJob::class, fn (DeleteProjectJob $job): bool => $job->hiccupAttempt === 1);
    }

    public function test_a_project_the_engine_already_dropped_is_cleaned_up(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['message' => 'Not found'], 404)]);

        $this->runOnce($application);

        $this->assertDatabaseMissing('applications', ['id' => $application->id]);
        Queue::assertNotPushed(DeleteProjectJob::class);
    }

    /** Another refusal is the user's to see (and retry by hand): the tail ends and the project stays. */
    public function test_a_refusal_other_than_busy_ends_the_tail(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1513 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['message' => 'Not allowed.'], 403)]);

        $this->runOnce($application);

        $this->assertDatabaseHas('applications', ['id' => $application->id]);
        Queue::assertNotPushed(DeleteProjectJob::class);
    }

    /** A staging that appeared meanwhile refuses the delete locally (422 in the request): no retry can change it. */
    public function test_a_project_that_gained_a_staging_ends_the_tail(): void
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

        Queue::fake();
        Http::fake();

        $this->runOnce($application);

        $this->assertDatabaseHas('applications', ['id' => $application->id]);
        Queue::assertNotPushed(DeleteProjectJob::class);
        Http::assertNotSent(fn ($request) => $request->method() === 'DELETE');
    }

    public function test_the_wall_clock_cap_ends_the_tail(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Queue::fake();
        // Engine: core/app/Http/Controllers/UserController.php:1525 -> UserController::destroy busy check
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['message' => 'The project is busy.'], 409)]);

        $this->runOnce($application, startedAt: now()->getTimestamp() - DeleteProjectJob::WALL_CLOCK_SECONDS - 1);

        $this->assertDatabaseHas('applications', ['id' => $application->id]);
        Queue::assertNotPushed(DeleteProjectJob::class);
    }

    /** The row is already gone (a delete from the project page won): nothing is left to do. */
    public function test_a_missing_row_makes_no_engine_call(): void
    {
        $this->configureEngine();
        Queue::fake();

        (new DeleteProjectJob(999999))->handle(app(ProjectService::class));

        Queue::assertNotPushed(DeleteProjectJob::class);
    }
}
