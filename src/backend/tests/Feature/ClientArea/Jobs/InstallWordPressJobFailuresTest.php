<?php

namespace Tests\Feature\ClientArea\Jobs;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Hosting\DocumentRootResolver;
use PanelAlpha\ClientArea\Jobs\WordPress\InstallWordPressJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressInstall;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use Tests\TestCase;

/**
 * The failure paths of `InstallWordPressJob`: no install to run, the Engine
 * refuses the core download, answers the database and user steps without
 * names, hiccups while the job waits for the project's create task, fails the
 * rollback, the theme or the sync after the install.
 *
 * Contract: a failed install drops what the run created, marks the install
 * `failed` with the Engine message and sends `installation_failed`; a theme or
 * sync failure after a good install never turns it into a failure.
 */
class InstallWordPressJobFailuresTest extends TestCase
{
    use JobFixtures, RefreshDatabase;

    /** @var list<string> Engine calls by "METHOD /path" */
    private array $calls = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        Sleep::fake(syncWithCarbon: true);
        Event::fake([ClientAreaNotificationRequested::class]);
    }

    /**
     * The Engine of a classic project `site1` that answers the whole install
     * chain; `$overrides` replaces the answer of one step ("METHOD path-suffix").
     *
     * @param  array<string, mixed>  $overrides  a response, or a closure taking the request
     */
    private function fakeEngine(array $overrides = []): void
    {
        $this->configureEngine();
        Http::fake(function (Request $request) use ($overrides) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $this->calls[] = $request->method().' '.$path;
            foreach ($overrides as $suffix => $answer) {
                [$method, $tail] = explode(' ', $suffix, 2);
                if ($method === $request->method() && str_ends_with($path, $tail)) {
                    return $answer instanceof \Closure ? $answer($request) : $answer;
                }
            }

            if ($path === '/api/tasks') {
                // Engine: core/app/Http/Controllers/TaskController.php:91 -> index (status=active, no task runs)
                return Http::response(['data' => [], 'meta' => ['last_page' => 1, 'total' => 0]]);
            }
            if (str_ends_with($path, '/wp/core/download')) {
                // Engine: core/app/System/Project/PhpHosting/WordPress/Core.php:173-177 -> download (WpCoreController.php:187)
                return Http::response(['data' => ['version' => '6.8.1', 'locale' => 'en_US', 'path' => '/home/site1/site1.example.com/public_html']]);
            }
            if ($request->method() === 'POST' && str_ends_with($path, '/mysql/databases')) {
                // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:117-177 -> store (prefixed `database`)
                return Http::response(['data' => ['id' => 5, 'user_id' => 10, 'database' => 'site1_'.$request['name']]], 201);
            }
            if ($request->method() === 'POST' && str_ends_with($path, '/mysql/users')) {
                // Engine: core/app/Http/Controllers/User/Mysql/UserController.php:105-129 -> store (prefixed `user`)
                return Http::response(['data' => ['id' => 6, 'user_id' => 10, 'user' => 'site1_'.$request['name']]], 201);
            }
            if (str_contains($path, '/mysql/privileges/')) {
                // Engine: core/app/Http/Controllers/User/Mysql/PrivilegesController.php:86-113 -> update
                return Http::response(['success' => true]);
            }
            if (str_ends_with($path, '/mysql/server-info')) {
                // Engine: core/app/Http/Controllers/User/MysqlController.php:38-46 -> serverInfo
                return Http::response(['data' => ['host' => 'database-users.shared-hosting.palocal', 'port' => '3306']]);
            }
            if ($request->method() === 'DELETE') {
                // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:198-220 -> destroy (UserController.php:150-161 alike)
                return Http::response(['data' => ['id' => 5]]);
            }
            if (str_contains($path, '/projects/all')) {
                // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
                return Http::response(['data' => [$this->engineProject(10, 'site1')]]);
            }
            if (str_ends_with($path, '/domains')) {
                // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list (the main domain's document root)
                return Http::response(['data' => [['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => ['document_root' => '/site1.example.com/public_html']]]]);
            }

            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:126 -> store; WpCoreController.php:241 -> install; WpThemeController.php:292/339 (`{data:{message}}`)
            return Http::response(['data' => ['message' => 'Success.']]);
        });
    }

    /**
     * @param  array<string, mixed>  $params
     */
    private function application(array $params = [], string $status = WordPressInstall::IN_PROGRESS, string $username = 'site1'): Application
    {
        $application = $this->bareApplication(['engine_username' => $username]);
        WordPressInstall::query()->create([
            'application_id' => $application->id,
            'status' => $status,
            'params' => $params + [
                'url' => 'https://site1.example.com',
                'title' => 'My blog',
                'admin_user' => 'admin',
                'admin_email' => 'owner@example.com',
                'admin_password' => 'Secret-pass-1',
                'locale' => null,
                'version' => null,
                'dir' => '',
                'db_prefix' => 'wp_',
                'theme' => null,
            ],
        ]);

        return $application;
    }

    private function runJob(Application $application): void
    {
        (new InstallWordPressJob($application->id))->handle(app(ApplicationSynchronizer::class), app(DocumentRootResolver::class));
    }

    private function install(Application $application): WordPressInstall
    {
        return WordPressInstall::query()->where('application_id', $application->id)->firstOrFail();
    }

    /**
     * @return list<string>
     */
    private function callsMatching(string $pattern): array
    {
        return array_values(array_filter($this->calls, static fn (string $call): bool => preg_match($pattern, $call) === 1));
    }

    public function test_a_project_without_a_running_install_is_left_alone(): void
    {
        $plain = $this->bareApplication();
        $finished = $this->application(status: WordPressInstall::FINISHED, username: 'site2');
        $this->fakeEngine();

        $this->runJob($plain);
        $this->runJob($finished);
        (new InstallWordPressJob($plain->id))->failed();
        (new InstallWordPressJob($finished->id))->failed();

        $this->assertSame([], $this->calls);
        $this->assertSame(WordPressInstall::FINISHED, $this->install($finished)->status);
        $this->assertNotNotified();
    }

    public function test_a_core_download_refusal_fails_the_install_without_a_rollback(): void
    {
        $application = $this->application();
        // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:187 -> download (a refusal that is not the 409 of an earlier download)
        $this->fakeEngine(['POST /wp/core/download' => Http::response(['message' => 'The disk quota is used up.'], 403)]);

        $this->runJob($application);

        $this->assertSame(WordPressInstall::FAILED, $this->install($application)->status);
        $this->assertSame('The disk quota is used up.', $this->install($application)->error);
        $this->assertSame([], $this->callsMatching('#^(POST|PUT|DELETE) .*/mysql/#'));
        $this->assertNotified(InstallWordPressJob::FAILED_TYPE, true, 'The disk quota is used up.');
    }

    public function test_the_engine_answering_the_database_and_user_without_names_falls_back_to_the_prefixed_names(): void
    {
        $application = $this->application();
        $this->fakeEngine([
            // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:117-177 -> store (an answer without `database`)
            'POST /mysql/databases' => Http::response(['data' => []], 201),
            // Engine: core/app/Http/Controllers/User/Mysql/UserController.php:105-129 -> store (an answer without `user`)
            'POST /mysql/users' => Http::response(['data' => []], 201),
        ]);

        $this->runJob($application);

        $this->assertSame(WordPressInstall::FINISHED, $this->install($application)->status);
        $this->assertCount(1, $this->callsMatching('#^PUT /api/projects/site1/mysql/privileges/site1_wp[a-z0-9]{6}/site1_wp[a-z0-9]{6}$#'));
    }

    public function test_an_unreachable_engine_while_waiting_for_the_create_task_is_waited_out(): void
    {
        $application = $this->application();
        $polls = 0;
        $this->fakeEngine(['GET /api/tasks' => function () use (&$polls) {
            if ($polls++ === 0) {
                throw new ConnectionException('Engine down');
            }

            // Engine: core/app/Http/Controllers/TaskController.php:91 -> index (status=active, no task runs any more)
            return Http::response(['data' => [], 'meta' => ['last_page' => 1, 'total' => 0]]);
        }]);

        $this->runJob($application);

        $this->assertSame(2, $polls);
        $this->assertSame(WordPressInstall::FINISHED, $this->install($application)->status);
    }

    public function test_a_failing_theme_does_not_fail_a_good_install(): void
    {
        $application = $this->application(['theme' => 'astra']);
        // Engine: core/app/Http/Controllers/User/Wp/WpThemeController.php:292 -> install (the theme cannot be installed)
        $this->fakeEngine(['POST /wp/themes/install' => Http::response(['message' => 'The theme does not exist.'], 500)]);

        $this->runJob($application);

        $this->assertSame(WordPressInstall::FINISHED, $this->install($application)->status);
        $this->assertNotified(InstallWordPressJob::FINISHED_TYPE, false);
    }

    public function test_a_failing_project_listing_does_not_fail_a_good_install(): void
    {
        $application = $this->application();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll (the sync after the install fails)
        $this->fakeEngine(['GET /api/projects/all' => Http::response(['message' => 'boom'], 500)]);

        $this->runJob($application);

        $this->assertSame(WordPressInstall::FINISHED, $this->install($application)->status);
        $this->assertNotified(InstallWordPressJob::FINISHED_TYPE, false);
    }

    public function test_a_rollback_that_cannot_delete_what_the_run_created_still_ends_the_install(): void
    {
        $application = $this->application();
        // A DELETE path ends in the generated name, so any DELETE fails.
        $this->fakeEngine([
            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:126 -> store (the config step fails)
            'POST /wp/config' => Http::response(['message' => 'Could not write wp-config.php.'], 500),
            // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:198-220 -> destroy (the rollback delete fails)
            'DELETE ' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->runJob($application);

        $this->assertSame(WordPressInstall::FAILED, $this->install($application)->status);
        $this->assertSame('Could not write wp-config.php.', $this->install($application)->error);
        $this->assertCount(2, $this->callsMatching('#^DELETE /api/projects/site1/mysql/(users|databases)/site1_wp#'), 'both deletes were tried');
        $this->assertNotified(InstallWordPressJob::FAILED_TYPE, true, 'Could not write wp-config.php.');
    }

    public function test_a_typed_database_the_project_already_has_is_reused_and_kept_on_a_failure(): void
    {
        $application = $this->application(['db_name' => 'blog']);
        $this->fakeEngine([
            // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:60 -> index (the project already has `site1_blog`)
            'GET /mysql/databases' => Http::response(['data' => [['id' => 5, 'user_id' => 10, 'database' => 'site1_blog']]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:126 -> store (the config step fails)
            'POST /wp/config' => Http::response(['message' => 'Could not write wp-config.php.'], 500),
        ]);

        $this->runJob($application);

        $this->assertSame([], $this->callsMatching('#^POST .*/mysql/databases$#'), 'the existing database is not created again');
        $this->assertCount(1, $this->callsMatching('#^PUT /api/projects/site1/mysql/privileges/site1_wp[a-z0-9]{6}/site1_blog$#'));
        $this->assertSame([], $this->callsMatching('#^DELETE .*/mysql/databases/#'), 'a database the run did not create is never dropped');
        $this->assertCount(1, $this->callsMatching('#^DELETE .*/mysql/users/#'));
    }

    public function test_a_typed_database_the_project_does_not_have_is_created_under_that_name(): void
    {
        $application = $this->application(['db_name' => 'blog']);
        $this->fakeEngine([
            // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:60 -> index (no database yet)
            'GET /mysql/databases' => Http::response(['data' => [['id' => 6, 'user_id' => 10, 'database' => 'site1_other']]]),
        ]);

        $this->runJob($application);

        $this->assertSame(WordPressInstall::FINISHED, $this->install($application)->status);
        Http::assertSent(fn (Request $request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/mysql/databases')
            && $request['name'] === 'blog');
    }
}
