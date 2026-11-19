<?php

namespace Tests\Feature\ClientArea\Jobs;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\ImportStatusChanged;
use PanelAlpha\ClientArea\Jobs\Application\AttachGitSourceJob;
use PanelAlpha\ClientArea\Jobs\Application\RefreshProjectWordPressJob;
use PanelAlpha\ClientArea\Jobs\Git\FollowProjectHookDeploysJob;
use PanelAlpha\ClientArea\Listeners\SearchReplaceOnDomainChange;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\HookDeployFollower;
use PanelAlpha\ClientArea\Projects\ProjectWordPressDetails;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use Tests\TestCase;

/**
 * The small Client Area jobs, listener and broadcast event whose edge paths
 * the larger tests skip: a project deleted while a job waits, the broadcast of
 * an import status, and the search-and-replace after a domain change when the
 * Engine refuses it every time.
 *
 * Contract: a job for a deleted project does nothing and calls no Engine; the
 * domain change is already done, so a failing search-and-replace is reported
 * after three tries and never thrown.
 */
class ProjectJobsAndListenersFailuresTest extends TestCase
{
    use JobFixtures, RefreshDatabase;

    private function deletedApplicationId(): int
    {
        $application = $this->bareApplication();
        $id = $application->id;
        $application->delete();

        return $id;
    }

    public function test_attaching_a_git_source_to_a_deleted_project_does_nothing(): void
    {
        Event::fake([ClientAreaNotificationRequested::class]);
        Http::fake();
        $job = new AttachGitSourceJob($this->deletedApplicationId(), ['git_repo' => 'https://github.com/example/site.git', 'git_branch' => null, 'git_token' => null, 'env_vars' => []], 'user.instance.installation_finished', 'user.instance.installation_failed');

        Queue::fake();
        $job->handle();
        $job->failed();

        Http::assertNothingSent();
        Queue::assertNothingPushed();
        $this->assertNotNotified();
    }

    public function test_refreshing_the_wordpress_details_of_a_deleted_project_does_nothing(): void
    {
        Http::fake();

        (new RefreshProjectWordPressJob($this->deletedApplicationId()))->handle(app(ProjectWordPressDetails::class));

        Http::assertNothingSent();
    }

    public function test_following_the_hook_deploys_of_a_deleted_project_does_nothing(): void
    {
        Event::fake([ClientAreaNotificationRequested::class]);
        Http::fake();
        $job = new FollowProjectHookDeploysJob($this->deletedApplicationId());

        $job->handle(app(HookDeployFollower::class), app(EngineHealth::class));
        $job->failed();

        Http::assertNothingSent();
        $this->assertNotNotified();
    }

    public function test_the_import_status_event_names_its_broadcast_and_carries_the_project(): void
    {
        $event = new ImportStatusChanged('user.abc123', ['id' => 5, 'name' => 'Blog']);

        $this->assertSame('App\\Events\\ImportStatusChanged', $event->broadcastAs());
        $this->assertSame('private-user.abc123', $event->broadcastOn()->name);
        $this->assertSame(['application' => ['id' => 5, 'name' => 'Blog']], $event->broadcastWith());
    }

    public function test_the_import_status_is_not_broadcast_to_a_recipient_that_is_no_panel_user(): void
    {
        Event::fake([ImportStatusChanged::class]);
        $application = $this->bareApplication();
        $this->mock(AccessResolver::class, function ($mock): void {
            $mock->shouldReceive('usersFor')->andReturn(new Collection([new class implements Authenticatable
            {
                public function getAuthIdentifierName(): string
                {
                    return 'id';
                }

                public function getAuthIdentifier(): int
                {
                    return 1;
                }

                public function getAuthPasswordName(): string
                {
                    return 'password';
                }

                public function getAuthPassword(): string
                {
                    return '';
                }

                public function getRememberToken(): ?string
                {
                    return null;
                }

                public function setRememberToken($value): void {}

                public function getRememberTokenName(): string
                {
                    return 'remember_token';
                }
            }]));
        });

        ImportStatusChanged::forEveryone($application);

        Event::assertNotDispatched(ImportStatusChanged::class);
    }

    public function test_a_search_replace_the_engine_refuses_three_times_is_reported_and_not_thrown(): void
    {
        Exceptions::fake();
        $application = $this->bareApplication(['type' => Application::TYPE_WORDPRESS]);
        // Engine: core/app/Http/Controllers/User/Wp/WpSearchReplaceController.php:40 -> search-replace (refused every time)
        Http::fake(['engine.example.com/api/projects/site1/wp/search-replace' => Http::response(['message' => 'The database is locked.'], 500)]);

        (new SearchReplaceOnDomainChange)->searchReplace($application, 'old.example.com', 'site1.example.com');

        Http::assertSentCount(3);
        Http::assertSent(fn (Request $request): bool => ($request['args'] ?? null) === ['--precise']);
        Http::assertSent(fn (Request $request): bool => ($request['args'] ?? null) === ['--dry-run']);
        Exceptions::assertReportedCount(3);
        Exceptions::assertReported(EngineRequestException::class);
    }
}
