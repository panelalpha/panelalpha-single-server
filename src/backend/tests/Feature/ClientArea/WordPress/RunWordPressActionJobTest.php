<?php

namespace Tests\Feature\ClientArea\WordPress;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Sleep;
use PanelAlpha\ClientArea\Http\Presenters\WordPress\PluginPresenter;
use PanelAlpha\ClientArea\Http\Presenters\WordPress\ThemePresenter;
use PanelAlpha\ClientArea\Jobs\WordPress\RunWordPressActionJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressAsyncStatus;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;
use PanelAlpha\ClientArea\Projects\ProjectWordPressDetails;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The WordPress action job runs one `wp/*`
 * call, persists the panel-owned `async_status`, and turns it into the CA
 * notification carrying the plugin/theme row **built here from the final
 * Engine state** (the CA matches on `item.name`, `Instances.js:377-384`) with
 * `includeInstance: false` (old `Notifications/User/Plugin/*` has no
 * `instance` key); `failed()` ends the spinner with a generic message.
 *
 * Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:292 → WpPluginController::install
 * (`POST projects/{u}/wp/plugins/install`), a synchronous call.
 */
class RunWordPressActionJobTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(User $user): Application
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/UserController.php:122
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'wpsite', ['details' => ['template' => 'dind']]),
        ]])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        $application = Application::query()->where('engine_username', 'wpsite')->firstOrFail();
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        return $application;
    }

    private function job(Application $application): RunWordPressActionJob
    {
        return new RunWordPressActionJob(
            $application->id,
            RunWordPressActionJob::PLUGIN_INSTALL,
            'user.instance.plugin.install_finished',
            'user.instance.plugin.install_failed',
            ['slug' => 'akismet'],
            WordPressAsyncStatus::PLUGIN,
            'akismet',
            'install',
        );
    }

    private function runJob(RunWordPressActionJob $job): void
    {
        $job->handle(app(PluginPresenter::class), app(ThemePresenter::class));
    }

    public function test_a_successful_action_marks_finished_and_notifies_the_final_row(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:292 → Plugins::install
            // (core/app/System/Project/PhpHosting/WordPress/Plugins.php:87), `{data:{plugin,message}}`.
            'engine.example.com/api/projects/wpsite/wp/plugins/install*' => Http::response(['data' => ['plugin' => 'akismet']]),
            // The final state the job reads back: WP-CLI `plugin get` fields.
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:192 → `{data:{name,…}}`
            // (core/app/System/Project/PhpHosting/WordPress/Plugins.php:46).
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet*' => Http::response(['data' => [
                'name' => 'akismet', 'status' => 'inactive', 'version' => '5.3', 'update' => 'none',
            ]]),
        ]);

        $this->runJob($this->job($application));

        $this->assertSame(
            WordPressAsyncStatus::FINISHED,
            WordPressAsyncStatus::query()->where('application_id', $application->id)->where('name', 'akismet')->value('status'),
        );
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.plugin.install_finished'
            && $n->includeInstance === false
            && ($n->payload['plugin']['name'] ?? null) === 'akismet'
            && ($n->payload['plugin']['version'] ?? null) === '5.3'
            && ($n->payload['plugin']['async_status']['install'] ?? null) === WordPressAsyncStatus::FINISHED
            && ! array_key_exists('instance', $n->toArray($user)));
    }

    public function test_a_plugin_update_runs_the_engine_and_notifies_the_final_row(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:427 → Plugins::update
            // (core/app/System/Project/PhpHosting/WordPress/Plugins.php:104), `{data:{plugin,message}}`.
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet/update*' => Http::response(['data' => ['plugin' => 'akismet']]),
            // The final state the job reads back: Engine WpPluginController::show:192 → `{data:{name,…}}`.
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:192
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet*' => Http::response(['data' => [
                'name' => 'akismet', 'status' => 'active', 'version' => '5.4', 'update' => 'none',
            ]]),
        ]);

        $this->runJob(new RunWordPressActionJob(
            $application->id,
            RunWordPressActionJob::PLUGIN_UPDATE,
            'user.instance.plugin.update_finished',
            'user.instance.plugin.update_failed',
            [],
            WordPressAsyncStatus::PLUGIN,
            'akismet',
            'update',
        ));

        Http::assertSent(fn ($r) => $r->method() === 'POST' && str_ends_with($r->url(), '/wp/plugins/akismet/update'));
        $this->assertSame(
            WordPressAsyncStatus::FINISHED,
            WordPressAsyncStatus::query()->where('application_id', $application->id)->where('name', 'akismet')->value('status'),
        );
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.plugin.update_finished'
            && $n->includeInstance === false
            && ($n->payload['plugin']['name'] ?? null) === 'akismet'
            && ($n->payload['plugin']['version'] ?? null) === '5.4'
            && ($n->payload['plugin']['async_status']['update'] ?? null) === WordPressAsyncStatus::FINISHED);
    }

    public function test_a_theme_install_notifies_the_presented_theme_row_without_instance(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:292 → Themes::install
            // (core/app/System/Project/PhpHosting/WordPress/Themes.php:87), `{data:{theme,message}}`.
            'engine.example.com/api/projects/wpsite/wp/themes/install*' => Http::response(['data' => ['theme' => 'astra']]),
            // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:74 → Themes::list
            // (core/app/System/Project/PhpHosting/WordPress/Themes.php:24), `{data:[{name,version,…}]}`.
            'engine.example.com/api/projects/wpsite/wp/themes*' => Http::response(['data' => [
                ['name' => 'astra', 'status' => 'active', 'version' => '4.6', 'update' => 'none'],
            ]]),
        ]);

        $this->runJob(new RunWordPressActionJob(
            $application->id,
            RunWordPressActionJob::THEME_INSTALL,
            'user.instance.theme.install_finished',
            'user.instance.theme.install_failed',
            ['slug' => 'astra'],
            WordPressAsyncStatus::THEME,
            'astra',
            'install',
        ));

        // Old ThemeResource shape: `type` is `marketplace` (ThemePresenter).
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.theme.install_finished'
            && $n->includeInstance === false
            && ($n->payload['theme']['name'] ?? null) === 'astra'
            && ($n->payload['theme']['version'] ?? null) === '4.6'
            && ($n->payload['theme']['type'] ?? null) === 'marketplace'
            && ($n->payload['theme']['async_status']['install'] ?? null) === WordPressAsyncStatus::FINISHED);
    }

    public function test_an_install_sends_the_slug_and_force_to_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:248-298 (WpPluginInstallRequest: slug, force),
            // `{data:{plugin,message}}`.
            'engine.example.com/api/projects/wpsite/wp/plugins/install*' => Http::response(['data' => ['plugin' => 'hello-dolly']]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:74 -> WpPluginController::index
            'engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => [
                ['name' => 'hello-dolly', 'status' => 'inactive', 'version' => '1.6', 'update' => 'available'],
            ]]),
        ]);

        $this->runJob(new RunWordPressActionJob(
            $application->id,
            RunWordPressActionJob::PLUGIN_INSTALL,
            'user.instance.plugin.install_finished',
            'user.instance.plugin.install_failed',
            ['slug' => 'hello-dolly', 'force' => true],
            WordPressAsyncStatus::PLUGIN,
            'hello-dolly',
            'install',
        ));

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/wp/plugins/install')
            && $request['slug'] === 'hello-dolly' && $request['force'] === true && ! isset($request['url']));
    }

    public function test_a_theme_update_runs_the_engine_and_notifies_the_final_row(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:383 → Themes::update
            // (core/app/System/Project/PhpHosting/WordPress/Themes.php:111), `{data:{theme,message}}`.
            'engine.example.com/api/projects/wpsite/wp/themes/astra/update*' => Http::response(['data' => ['theme' => 'astra']]),
            // The final state the job reads back: Engine WpThemeController::index:74 → Themes::list.
            // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:74
            'engine.example.com/api/projects/wpsite/wp/themes*' => Http::response(['data' => [
                ['name' => 'astra', 'status' => 'active', 'version' => '4.7', 'update' => 'none'],
            ]]),
        ]);

        $this->runJob(new RunWordPressActionJob(
            $application->id,
            RunWordPressActionJob::THEME_UPDATE,
            'user.instance.theme.update_finished',
            'user.instance.theme.update_failed',
            [],
            WordPressAsyncStatus::THEME,
            'astra',
            'update',
        ));

        // The Engine path is the theme update, not the install/list.
        Http::assertSent(fn ($r) => $r->method() === 'POST' && str_ends_with($r->url(), '/wp/themes/astra/update'));
        $this->assertSame(
            WordPressAsyncStatus::FINISHED,
            WordPressAsyncStatus::query()->where('application_id', $application->id)->where('name', 'astra')->value('status'),
        );
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.theme.update_finished'
            && $n->includeInstance === false
            && ($n->payload['theme']['name'] ?? null) === 'astra'
            && ($n->payload['theme']['version'] ?? null) === '4.7'
            && ($n->payload['theme']['async_status']['update'] ?? null) === WordPressAsyncStatus::FINISHED);
    }

    public function test_engine_validation_failure_marks_failed_with_the_engine_message(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        // 422 → EngineValidationException (extends Laravel ValidationException).
// Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:292
        Http::fake(['engine.example.com/api/projects/wpsite/wp/plugins/install*' => Http::response(['message' => 'slug not found'], 422)]);

        $this->runJob($this->job($application));

        $this->assertSame(
            WordPressAsyncStatus::FAILED,
            WordPressAsyncStatus::query()->where('application_id', $application->id)->where('name', 'akismet')->value('status'),
        );
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.plugin.install_failed'
            && $n->isError === true
            && $n->includeInstance === false
            && ($n->payload['plugin']['async_status']['install'] ?? null) === WordPressAsyncStatus::FAILED
            && str_contains($n->payload['message'] ?? '', 'slug not found'));
    }

    public function test_engine_down_marks_failed_and_always_notifies(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake(fn () => throw new ConnectionException('down'));

        $job = $this->job($application);
        $this->runJob($job);

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.plugin.install_failed'
            && $n->isError === true
            && $n->includeInstance === false
            && ($n->payload['plugin']['name'] ?? null) === 'akismet'
            && ($n->payload['plugin']['async_status']['install'] ?? null) === WordPressAsyncStatus::FAILED);
    }

    public function test_engine_5xx_marks_failed_and_always_notifies(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        // A 5xx is an `EngineRequestException`, caught alongside the connection
        // error; the CA must still get a `*_failed` type.
        // Engine: core/app/Http/Controllers/User/Wp/WordPressController.php:23 -> respond
        Http::fake(['engine.example.com/api/projects/wpsite/wp/plugins/install*' => Http::response(['message' => 'boom'], 500)]);

        $this->runJob($this->job($application));

        $this->assertSame(
            WordPressAsyncStatus::FAILED,
            WordPressAsyncStatus::query()->where('application_id', $application->id)->where('name', 'akismet')->value('status'),
        );
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.plugin.install_failed'
            && $n->isError === true
            && $n->includeInstance === false
            && ($n->payload['plugin']['async_status']['install'] ?? null) === WordPressAsyncStatus::FAILED
            && str_contains($n->payload['message'] ?? '', 'boom'));
    }

    public function test_failed_notifies_a_theme_without_a_framework_message(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();

        // The theme branch of `failed()` mirrors the plugin one: the row is
        // built without an Engine call (the worker already gave up), the
        // framework text never reaches the CA, and no `instance` key is set
        // (old `Notifications/User/Theme/*`).
        (new RunWordPressActionJob(
            $application->id,
            RunWordPressActionJob::THEME_INSTALL,
            'user.instance.theme.install_finished',
            'user.instance.theme.install_failed',
            ['slug' => 'astra'],
            WordPressAsyncStatus::THEME,
            'astra',
            'install',
        ))->failed(new \RuntimeException('MaxAttemptsExceededException: job timed out'));

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.theme.install_failed'
            && $n->isError === true
            && $n->includeInstance === false
            && ($n->payload['message'] ?? null) === RunWordPressActionJob::GENERIC_FAILURE
            && ($n->payload['theme']['name'] ?? null) === 'astra'
            && ($n->payload['theme']['async_status']['install'] ?? null) === WordPressAsyncStatus::FAILED
            && ! array_key_exists('instance', $n->toArray($user)));
    }

    public function test_failed_sends_a_generic_message_and_never_framework_text(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();

        // A killed worker / MaxAttemptsExceeded: no Engine call happens here, so
        // the row falls back to the name the CA already knows.
        $this->job($application)->failed(new \RuntimeException('MaxAttemptsExceededException: job timed out'));

        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.plugin.install_failed'
            && $n->isError === true
            && $n->includeInstance === false
            && ($n->payload['message'] ?? null) === RunWordPressActionJob::GENERIC_FAILURE
            && ($n->payload['plugin']['name'] ?? null) === 'akismet'
            && ($n->payload['plugin']['application_id'] ?? null) === $application->id
            && ($n->payload['plugin']['async_status']['install'] ?? null) === WordPressAsyncStatus::FAILED);
    }

    public function test_a_running_core_update_reports_in_progress(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        WordPressAsyncStatus::query()->create([
            'application_id' => $application->id,
            'type' => WordPressAsyncStatus::CORE,
            'name' => WordPressAsyncStatus::CORE,
            'action' => 'update',
            'status' => WordPressAsyncStatus::PENDING,
        ]);

        $statusDuringTheCall = null;
        Http::fake([
            'engine.example.com/api/projects/wpsite/wp/core/update*' => function () use ($application, &$statusDuringTheCall) {
                $statusDuringTheCall = WordPressAsyncStatus::query()
                    ->where('application_id', $application->id)
                    ->where('type', WordPressAsyncStatus::CORE)
                    ->value('status');

// Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:219
                return Http::response(['data' => []]);
            },
        ]);

        $this->runJob(new RunWordPressActionJob(
            $application->id,
            RunWordPressActionJob::CORE_UPDATE,
            'user.instance.update_wordpress_finished',
            'user.instance.update_wordpress_failed',
            ['version' => '6.6'],
            WordPressAsyncStatus::CORE,
            WordPressAsyncStatus::CORE,
            'update',
        ));

        // Old UpdateWordpress.php:64 set `in_progress` while the Engine ran; the
        // CA gates its update spinner on async_status.update (Instances.js:246).
        $this->assertSame(WordPressAsyncStatus::IN_PROGRESS, $statusDuringTheCall);
    }

    public function test_the_wordpress_action_passes_the_long_engine_timeout(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        $spy = $this->spyEngineTimeout($application);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:292 → Plugins::install
            'engine.example.com/api/projects/wpsite/wp/plugins/install*' => Http::response(['data' => ['plugin' => 'akismet']]),
            // Engine: core/app/Http/Controllers/User/Wp/WpPluginController.php:192 → `{data:{name,…}}`
            'engine.example.com/api/projects/wpsite/wp/plugins/akismet*' => Http::response(['data' => [
                'name' => 'akismet', 'status' => 'inactive', 'version' => '5.3', 'update' => 'none',
            ]]),
        ]);

        $job = $this->job($application);
        $this->runJob($job);

        // WP-CLI can run for minutes; the default 30 s client timeout would fail
        // it, so the job passes the long per-call timeout and outlives it on the
        // `long` connection.
        $this->assertSame(600, RunWordPressActionJob::ENGINE_TIMEOUT_SECONDS);
        $this->assertSame(RunWordPressActionJob::ENGINE_TIMEOUT_SECONDS, $spy->requestedTimeout);
        $this->assertSame('database-long', $job->connection);
        $this->assertSame(1, $job->tries);
        $this->assertSame(1700, $job->timeout);
    }

    public function test_a_core_update_with_the_backup_box_makes_the_backup_before_the_update(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Sleep::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show, twice: running, then completed
        Http::fake([
            'engine.example.com/api/tasks/555*' => Http::sequence()->push(['data' => ['id' => 555, 'status' => 'running']])->push(['data' => ['id' => 555, 'status' => 'completed']]),
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:219
            'engine.example.com/api/projects/wpsite/wp/core/update*' => Http::response(['data' => []]),
            // The refresh the job runs after a finished action: WpCoreController.php:112, :63 and WpPluginController.php:74
            'engine.example.com/api/projects/wpsite/wp/core/updates*' => Http::response(['data' => []]),
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => true, 'version' => '6.6']]),
            'engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => []]),
        ]);

        // The service started the backup before queuing this job (backup task 555); the update waits for it.
        $this->runJob(new RunWordPressActionJob(
            $application->id,
            RunWordPressActionJob::CORE_UPDATE,
            'user.instance.update_wordpress_finished',
            'user.instance.update_wordpress_failed',
            ['version' => '6.6'],
            WordPressAsyncStatus::CORE,
            WordPressAsyncStatus::CORE,
            'update',
            555,
        ));

        $urls = Http::recorded()->map(static fn (array $pair): string => $pair[0]->url())->all();
        $update = array_search(true, array_map(static fn (string $url): bool => str_ends_with($url, '/wp/core/update'), $urls), true);
        $polls = array_keys(array_filter($urls, static fn (string $url): bool => str_contains($url, '/api/tasks/555')));

        $this->assertNotFalse($update);
        $this->assertCount(2, $polls);
        // Every poll comes before the update, and the backup is polled, never started by the job.
        $this->assertSame(max($polls), $update - 1);
        Sleep::assertSlept(fn ($duration): bool => (int) $duration->totalSeconds === RunWordPressActionJob::BACKUP_POLL_SECONDS, 1);
        $this->assertSame(
            WordPressAsyncStatus::FINISHED,
            WordPressAsyncStatus::query()->where('application_id', $application->id)->where('type', WordPressAsyncStatus::CORE)->value('status'),
        );
    }

    public function test_a_failed_backup_stops_the_core_update(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show, the backup task's final state
        Http::fake(['engine.example.com/api/tasks/555*' => Http::response(['data' => ['id' => 555, 'status' => 'failed']])]);

        WordPressAsyncStatus::query()->create([
            'application_id' => $application->id,
            'type' => WordPressAsyncStatus::CORE,
            'name' => WordPressAsyncStatus::CORE,
            'action' => 'update',
            'status' => WordPressAsyncStatus::PENDING,
        ]);

        $this->runJob(new RunWordPressActionJob(
            $application->id,
            RunWordPressActionJob::CORE_UPDATE,
            'user.instance.update_wordpress_finished',
            'user.instance.update_wordpress_failed',
            ['version' => '6.6'],
            WordPressAsyncStatus::CORE,
            WordPressAsyncStatus::CORE,
            'update',
            555,
        ));

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/wp/core/update'));
        $this->assertSame(
            WordPressAsyncStatus::FAILED,
            WordPressAsyncStatus::query()->where('application_id', $application->id)->where('type', WordPressAsyncStatus::CORE)->value('status'),
        );
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.update_wordpress_failed'
            && $n->isError === true
            && $n->payload['message'] === RunWordPressActionJob::BACKUP_FAILED);
    }

    public function test_a_finished_core_update_refreshes_the_version_the_installation_card_reads(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:219
            'engine.example.com/api/projects/wpsite/wp/core/update*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:112
            'engine.example.com/api/projects/wpsite/wp/core/updates*' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:63
            'engine.example.com/api/projects/wpsite/wp/core*' => Http::response(['data' => ['installed' => true, 'version' => '6.6']]),
            'engine.example.com/api/projects/wpsite/wp/plugins*' => Http::response(['data' => []]),
        ]);

        $this->runJob(new RunWordPressActionJob(
            $application->id,
            RunWordPressActionJob::CORE_UPDATE,
            'user.instance.update_wordpress_finished',
            'user.instance.update_wordpress_failed',
            ['version' => '6.6'],
            WordPressAsyncStatus::CORE,
            WordPressAsyncStatus::CORE,
            'update',
        ));

        // CA reads: components/cards/InstallationInfoCard.vue (status.wordpress from the project's `version`)
        $this->assertSame('6.6', Cache::get(ProjectWordPressDetails::cacheKey($application))['facts']['version']);
    }

    public function test_a_core_update_marks_the_project_async_status_and_keeps_the_instance(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Notification::fake();
        // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:219 → `{data:…}`.
        Http::fake(['engine.example.com/api/projects/wpsite/wp/core/update*' => Http::response(['data' => []])]);

        // The service already wrote the pending row (a core update
        // sets async_status.update); the job finishes it and notifies with the
        // project payload.
        WordPressAsyncStatus::query()->create([
            'application_id' => $application->id,
            'type' => WordPressAsyncStatus::CORE,
            'name' => WordPressAsyncStatus::CORE,
            'action' => 'update',
            'status' => WordPressAsyncStatus::PENDING,
        ]);

        $this->runJob(new RunWordPressActionJob(
            $application->id,
            RunWordPressActionJob::CORE_UPDATE,
            'user.instance.update_wordpress_finished',
            'user.instance.update_wordpress_failed',
            ['version' => '6.6'],
            WordPressAsyncStatus::CORE,
            WordPressAsyncStatus::CORE,
            'update',
        ));

        $this->assertSame(
            WordPressAsyncStatus::FINISHED,
            WordPressAsyncStatus::query()->where('application_id', $application->id)->where('type', WordPressAsyncStatus::CORE)->value('status'),
        );
        Notification::assertSentTo($user, ApplicationNotification::class, fn (ApplicationNotification $n) => $n->broadcastType() === 'user.instance.update_wordpress_finished'
            && $n->includeInstance === true
            && array_key_exists('instance', $n->toArray($user)));
    }
}
