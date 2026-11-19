<?php

namespace Tests\Feature\ClientArea\Jobs;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Http\Presenters\WordPress\PluginPresenter;
use PanelAlpha\ClientArea\Http\Presenters\WordPress\ThemePresenter;
use PanelAlpha\ClientArea\Jobs\WordPress\RunWordPressActionJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressAsyncStatus;
use PanelAlpha\ClientArea\Support\ProtectedProject;
use Tests\TestCase;

/**
 * The paths of `RunWordPressActionJob` the plugin and theme tests do not
 * reach: a project deleted while the job waits, an action name the job does
 * not know, a core update (no plugin or theme row), a theme the Engine does
 * not list after the install, and a protected project's refusal.
 *
 * Contract: the job ends the CA spinner with the finished or the failed type;
 * a protected project's refusal reaches the user as the panel's own sentence.
 */
class RunWordPressActionJobFailuresTest extends TestCase
{
    use JobFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake([ClientAreaNotificationRequested::class]);
    }

    private function wordpress(): Application
    {
        return $this->bareApplication(['type' => Application::TYPE_WORDPRESS]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function job(Application $application, string $action, array $payload = [], ?string $itemType = null, ?string $itemName = null, ?string $itemAction = null): RunWordPressActionJob
    {
        return new RunWordPressActionJob(
            $application->id, $action, 'user.instance.wp.finished', 'user.instance.wp.failed', $payload, $itemType, $itemName, $itemAction,
        );
    }

    private function runJob(RunWordPressActionJob $job): void
    {
        $job->handle(app(PluginPresenter::class), app(ThemePresenter::class));
    }

    public function test_a_deleted_project_ends_quietly(): void
    {
        $application = $this->wordpress();
        $job = $this->job($application, RunWordPressActionJob::CORE_UPDATE);
        $application->delete();
        Http::fake();

        $this->runJob($job);
        $job->failed();

        Http::assertNothingSent();
        $this->assertNotNotified();
    }

    public function test_an_unknown_action_is_a_programming_error_not_a_user_failure(): void
    {
        $application = $this->wordpress();
        Http::fake();

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Unknown WordPress action: plugin.explode');

        try {
            $this->runJob($this->job($application, 'plugin.explode'));
        } finally {
            Http::assertNothingSent();
            $this->assertNotNotified();
        }
    }

    public function test_a_core_update_without_an_item_finishes_with_the_project_in_the_notification(): void
    {
        $application = $this->wordpress();
        Http::fake(function (Request $request) {
            if (str_ends_with((string) parse_url($request->url(), PHP_URL_PATH), '/wp/core/update')) {
                // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:241 -> update (`{data:{message}}`)
                return Http::response(['data' => ['message' => 'WordPress updated successfully.']]);
            }

            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 -> WpCoreController::status
            return Http::response(['data' => ['installed' => true, 'version' => '6.8.1', 'state' => 'installed']]);
        });

        $this->runJob($this->job($application, RunWordPressActionJob::CORE_UPDATE, ['version' => '6.8.1']));

        Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/wp/core/update') && $request['version'] === '6.8.1');
        Event::assertDispatched(ClientAreaNotificationRequested::class, fn (ClientAreaNotificationRequested $event): bool => $event->type === 'user.instance.wp.finished'
            && ! $event->isError
            && $event->includeInstance
            && $event->extra === ['version' => '6.8.1']);
        $this->assertSame(0, WordPressAsyncStatus::query()->count(), 'a core update keeps no plugin or theme status row');
    }

    public function test_the_failed_hook_of_a_core_update_sends_no_item_row(): void
    {
        $application = $this->wordpress();

        $this->job($application, RunWordPressActionJob::CORE_UPDATE)->failed();

        Event::assertDispatched(ClientAreaNotificationRequested::class, fn (ClientAreaNotificationRequested $event): bool => $event->type === 'user.instance.wp.failed'
            && $event->isError
            && $event->message === RunWordPressActionJob::GENERIC_FAILURE
            && $event->extra === []
            && $event->includeInstance);
    }

    public function test_an_installed_theme_the_engine_does_not_list_is_presented_by_its_name(): void
    {
        $application = $this->wordpress();
        Http::fake(function (Request $request) {
            if ($request->method() === 'POST') {
                // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:292 -> install (`{data:{message}}`)
                return Http::response(['data' => ['message' => 'Theme installed.']]);
            }
            if (str_ends_with((string) parse_url($request->url(), PHP_URL_PATH), '/wp/themes')) {
                // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:60 -> index (a list without the new theme)
                return Http::response(['data' => [['name' => 'twentytwentyfive', 'status' => 'active']]]);
            }

            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63 -> WpCoreController::status
            return Http::response(['data' => ['installed' => true, 'version' => '6.8.1', 'state' => 'installed']]);
        });

        $this->runJob($this->job($application, RunWordPressActionJob::THEME_INSTALL, ['slug' => 'astra'], WordPressAsyncStatus::THEME, 'astra', 'install'));

        Event::assertDispatched(ClientAreaNotificationRequested::class, fn (ClientAreaNotificationRequested $event): bool => $event->type === 'user.instance.wp.finished'
            && ($event->extra['theme']['name'] ?? null) === 'astra'
            && ! $event->includeInstance);
    }

    public function test_a_protected_projects_refusal_reaches_the_user_as_the_panels_sentence(): void
    {
        Exceptions::fake();
        $application = $this->wordpress();
        // Engine: core/app/Http/Middleware/EnsureProjectNotProtected.php:157 -> the 409 `project_protected` refusal
        Http::fake(['engine.example.com/api/projects/site1/wp/core/update' => Http::response(['message' => 'Project is protected.', 'code' => 'project_protected'], 409)]);

        $this->runJob($this->job($application, RunWordPressActionJob::CORE_UPDATE));

        $this->assertNotified('user.instance.wp.failed', true, ProtectedProject::REFUSAL);
    }
}
