<?php

namespace Tests\Feature\ClientArea\Deploy;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Hosting\DocumentRootResolver;
use PanelAlpha\ClientArea\Http\Requests\Project\InstallWordPressRequest;
use PanelAlpha\ClientArea\Jobs\WordPress\InstallWordPressJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressInstall;
use PanelAlpha\ClientArea\Projects\WordPressInstallService;
use PanelAlpha\ClientArea\Support\VirtualService;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Install WordPress on classic hosting (Engine 2.2.0).
 *
 * Contract:
 * - CA: the domain step `POST /services/{id}/domains {domain}`
 *   (`OnboardingModalWrapper.vue:1561-1576`) creates the classic project and
 *   answers `{data:{id, domain}}`; then `POST /instances/install` (rewritten to
 *   `/projects/install`) with `{service_id, domain_id, install_method, name,
 *   theme, shared_access, …standard form}` (`OnboardingModalWrapper.vue:1605-1614`,
 *   `OnboardingStandardFormModal.vue:713-730`); it reads `response.data.data`
 *   (`:1616-1621`) and waits for `user.instance.installation_finished|failed`
 *   (`apis/Auth.js:373-381`). Retry: `PUT /instances/{id}/retry-install`
 *   (`:1643-1654`).
 * - Old: `InstanceController::install` (:297-492) answered 201 `InstanceResource`
 *   with `async_status.installation: in_progress` and queued `InstallInstance`
 *   (`InstanceInstallRequest` rules, defaults https, `admin`, the user's email,
 *   a generated password); privilege `service.create_instance`, activity
 *   `user.instance.install`.
 * - Engine (develop-2-2-0): `POST wp/core/download` (`WpCoreController::download`
 *   :187, 409 when core files exist), `POST mysql/databases` (`DatabaseController::store`
 *   :117, `{data:{database}}`), `POST mysql/users` (`UserController::store` :105,
 *   `{data:{user}}`), `PUT mysql/privileges/{u}/{db}` (`PrivilegesController::update`
 *   :86, `{success:true}`), `GET mysql/server-info` (`MysqlController::serverInfo` :38),
 *   `POST wp/config` (`WpConfigController::store` :126), `POST wp/core/install`
 *   (`WpCoreController::install` :241), `PUT wp/language` (`WpLanguageController::update`
 *   :59), `GET tasks` (`TaskController::index` :91).
 */
final class InstallWordPressTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /** @var list<string> Engine calls by "METHOD /path" */
    private array $calls = [];

    /**
     * The Engine of a classic project `site1` that answers the whole install
     * chain; `$fail` makes one step answer `[status, body]`, `$activeTasks` is
     * how many polls still see a running task.
     *
     * @param  array<string, array{int, array<string, mixed>}>  $fail  "METHOD path-suffix" => [status, body]
     * @param  list<array<string, mixed>>  $offers  what the WordPress.org version check offers (empty: the call never answers)
     */
    private function fakeEngine(array $fail = [], int $activeTasks = 0, array $offers = []): void
    {
        $this->configureEngine();
        Http::fake([
            // External: https://codex.wordpress.org/WordPress.org_API (api.wordpress.org/core/version-check/1.7/; the panel's version list)
            'api.wordpress.org/*' => Http::response(['offers' => $offers]),
            '*' => function (Request $request) use ($fail, &$activeTasks) {
                $path = (string) parse_url($request->url(), PHP_URL_PATH);
                $key = $request->method().' '.$path;
                $this->calls[] = $key;
                foreach ($fail as $suffix => [$status, $body]) {
                    [$method, $tail] = explode(' ', $suffix, 2);
                    if ($method === $request->method() && str_ends_with($path, $tail)) {
                        // Engine: core/app/Http/Controllers/User/Wp/WordPressController.php:23-40 -> respond (the failing step's refusal)
                        return Http::response($body, $status);
                    }
                }

                if ($path === '/api/tasks') {
                    $running = $activeTasks-- > 0;

                    // Engine: core/app/Http/Controllers/TaskController.php:91 -> index (status=active, the project's create task)
                    return Http::response(['data' => $running ? [['id' => 41, 'status' => 'running', 'username' => 'site1']] : [], 'meta' => ['last_page' => 1, 'total' => $running ? 1 : 0]]);
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
                if (str_ends_with($path, '/wp/language')) {
                    // Engine: core/app/Http/Controllers/User/Wp/WpLanguageController.php:59-64 -> update
                    return Http::response(['data' => ['language' => $request['language'], 'message' => 'Language activated.']]);
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
            },
        ]);
    }

    /** The classic project the domain step created, which the install may target. */
    private function application(User $user): Application
    {
        $application = $this->domainStepProject($user);
        $this->calls = [];

        return $application;
    }

    /**
     * @param  array<string, mixed>  $params
     */
    private function startInstall(Application $application, array $params = []): void
    {
        WordPressInstall::query()->create([
            'application_id' => $application->id,
            'status' => WordPressInstall::IN_PROGRESS,
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
    }

    private function runJob(Application $application): void
    {
        (new InstallWordPressJob($application->id))->handle(app(ApplicationSynchronizer::class), app(DocumentRootResolver::class));
    }

    /**
     * The chain end to end: the CA's domain step creates the classic project,
     * the install answers the old 201 with `installation: in_progress` and
     * queues the job, and the job installs WordPress through the Engine.
     */
    public function test_the_domain_step_then_install_runs_the_whole_chain(): void
    {
        Queue::fake();
        Event::fake([ClientAreaNotificationRequested::class]);
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll; :300 -> projects storeAsync
            'engine.example.com/api/projects/all*' => Http::response(['data' => []]),
            'engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'shop', 'details' => ['username' => 'shop', 'domain' => 'shop.example.com']]], 202),
        ]);
        $user = User::factory()->create(['email' => 'owner@example.com']);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1566
        $domainId = $this->actingAs($user)->postJson('/api/services/'.VirtualService::ID.'/domains', ['domain' => 'shop.example.com'])
            ->assertStatus(202)->json('data.id');

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605-1614 (+ OnboardingStandardFormModal.vue:713-730)
        $response = $this->actingAs($user)->postJson('/api/projects/install', [
            'service_id' => VirtualService::ID,
            'domain_id' => $domainId,
            'install_method' => 'advanced',
            'install_type' => 'clean',
            'name' => 'My shop',
            'protocol' => 'https://',
            'dir' => '',
            'language' => 'pl_PL',
            'version' => 'latest',
            'admin_username' => 'boss',
            'admin_password' => 'Secret-pass-1',
            'admin_email' => 'boss@example.com',
            'db_prefix' => 'wp_',
            'theme' => 'astra',
            'shared_access' => [],
        ]);

        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1616-1621 (response.data.data)
        $response->assertCreated()->assertJsonPath('data.id', $domainId)->assertJsonPath('data.async_status.installation', 'in_progress');
        Queue::assertPushed(InstallWordPressJob::class, fn (InstallWordPressJob $job): bool => $job->applicationId === $domainId);

        $application = Application::query()->findOrFail($domainId);
        $install = $application->wordpressInstall;
        $this->assertNotNull($install);
        $this->assertSame('https://shop.example.com', $install->params['url']);
        $this->assertSame('pl_PL', $install->params['locale']);
        $this->assertNull($install->params['version']);
        $this->assertSame('My shop', $application->site_name);
        // The admin password is encrypted at rest.
        $this->assertStringNotContainsString('Secret-pass-1', (string) DB::table('wordpress_installs')->value('params'));

        $this->assertSame([
            'user_id' => $user->id,
            'action' => 'user.instance.install',
        ], (array) DB::table('activity_logs')->select('user_id', 'action')->latest('id')->first());
    }

    /**
     * Community's onboarding is always the simple one, where
     * the old code forced a clean install whatever `install_type` said
     * (`generateSuperQuickInstallParams()`, packages/api/app/Http/Requests/User/
     * InstanceInstallRequest.php:118-127), so a clone or template request still
     * starts the clean install; the paid product's advanced mode refuses them
     * (packages/edition-pro/tests/ClientArea/OnboardingCatalogTest).
     */
    public function test_community_ignores_the_install_type_as_the_simple_onboarding_did(): void
    {
        Queue::fake();
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1'), $this->engineProject(11, 'site2')]]),
        ]);
        $user = User::factory()->create(['email' => 'owner@example.com']);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        // Both are classic projects the domain step created (the install's only targets).
        Application::query()->update(['onboarding_at' => now()]);

        foreach (['site1' => 'clone', 'site2' => 'template'] as $username => $type) {
            $id = (int) Application::query()->where('engine_username', $username)->value('id');
            // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1757-1766 (+ OnboardingStandardFormModal.vue:713-730)
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1766-1767 (response.data.data)
            $this->actingAs($user)->postJson('/api/projects/install', [
                'service_id' => VirtualService::ID, 'domain_id' => $id, 'install_method' => 'advanced',
                'install_type' => $type, 'clone_instance_id' => 1, 'instance_template_id' => 2, 'shared_access' => [],
            ])->assertCreated()->assertJsonPath('data.id', $id);
        }
        Queue::assertPushed(InstallWordPressJob::class, 2);
    }

    /**
     * Community has no plan and no shared access, so the install keeps the sent site name (else the
     * domain), ignores a typed `db_name` (its form never offers the field; the job generates the name) and
     * `shared_access`, and allows the WordPress type. The paid answers are the plan's
     * (packages/edition-pro/tests/ClientArea/PlanOnboardingTest).
     */
    public function test_community_keeps_the_name_generates_the_database_and_shares_nothing(): void
    {
        Queue::fake();
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(10, 'site1'), $this->engineProject(11, 'site2')]]),
        ]);
        $user = User::factory()->create(['email' => 'owner@example.com']);
        // CA: packages/client-area/src/apis/Instances.js:76 (the CA lists `/instances`, rewritten to `/projects`)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $site1 = Application::query()->where('engine_username', 'site1')->firstOrFail();
        $site2 = Application::query()->where('engine_username', 'site2')->firstOrFail();
        // Both are classic projects the domain step created (the install's only targets).
        Application::query()->whereKey([$site1->id, $site2->id])->update(['onboarding_at' => now()]);

        foreach ([[$site1, 'Mine'], [$site2, null]] as [$application, $name]) {
            // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1756-1765 (+ OnboardingStandardFormModal.vue:496-505)
            // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1767-1768 (response.data.data)
            $this->actingAs($user)->postJson('/api/projects/install', [
                'service_id' => VirtualService::ID, 'domain_id' => $application->id, 'install_method' => 'simple',
                'name' => $name, 'db_name' => '1 not a name', 'shared_access' => ['friend@example.com'],
            ])->assertCreated()->assertJsonPath('data.id', $application->id);
        }

        $this->assertSame('Mine', $site1->refresh()->site_name);
        $this->assertSame('site2.example.com', $site2->refresh()->site_name);
        $this->assertNull($site1->wordpressInstall?->params['db_name']);
        $this->assertNull($site2->wordpressInstall?->params['db_name']);
        $this->assertSame(1, User::query()->count());
        Queue::assertPushed(InstallWordPressJob::class, 2);
    }

    public function test_the_job_runs_download_database_config_install_and_language(): void
    {
        Sleep::fake();
        Event::fake([ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $this->fakeEngine();
        $application = $this->application($user);
        $this->startInstall($application, ['locale' => 'pl_PL', 'version' => '6.8.1', 'theme' => 'astra']);

        $this->runJob($application);

        $chain = array_values(array_filter($this->calls, fn (string $call): bool => ! str_contains($call, '/projects/all')));
        $this->assertSame('GET /api/tasks', $chain[0]);
        $this->assertSame('POST /api/projects/site1/wp/core/download', $chain[1]);
        $this->assertSame('POST /api/projects/site1/mysql/databases', $chain[2]);
        $this->assertSame('POST /api/projects/site1/mysql/users', $chain[3]);
        $this->assertStringStartsWith('PUT /api/projects/site1/mysql/privileges/site1_wp', $chain[4]);
        $this->assertSame('GET /api/projects/site1/mysql/server-info', $chain[5]);
        $this->assertSame('POST /api/projects/site1/wp/config', $chain[6]);
        $this->assertSame('POST /api/projects/site1/wp/core/install', $chain[7]);
        $this->assertSame('PUT /api/projects/site1/wp/language', $chain[8]);
        $this->assertSame('POST /api/projects/site1/wp/themes/install', $chain[9]);
        $this->assertSame('POST /api/projects/site1/wp/themes/astra/activate', $chain[10]);

        Http::assertSent(fn (Request $r): bool => str_ends_with($r->url(), '/wp/core/download') && $r->data() === ['locale' => 'pl_PL', 'version' => '6.8.1']);
        Http::assertSent(fn (Request $r): bool => str_contains($r->url(), '/mysql/privileges/') && $r['privileges'] === 'ALL PRIVILEGES');
        Http::assertSent(function (Request $r): bool {
            if (! str_ends_with($r->url(), '/wp/config')) {
                return false;
            }
            $data = $r->data();

            return str_starts_with((string) $data['dbname'], 'site1_wp') && $data['dbname'] === $data['dbuser']
                && strlen((string) $data['dbpass']) === 24 && $data['dbhost'] === 'database-users.shared-hosting.palocal'
                && $data['dbprefix'] === 'wp_' && $data['locale'] === 'pl_PL' && $data['force'] === true;
        });
        Http::assertSent(fn (Request $r): bool => str_ends_with($r->url(), '/wp/core/install') && $r->data() === [
            'url' => 'https://site1.example.com', 'title' => 'My blog', 'admin_user' => 'admin',
            'admin_email' => 'owner@example.com', 'admin_password' => 'Secret-pass-1', 'skip_email' => true,
        ]);
        Http::assertSent(fn (Request $r): bool => str_ends_with($r->url(), '/wp/language') && $r->data() === ['language' => 'pl_PL']);

        $install = $application->fresh()?->wordpressInstall;
        $this->assertSame(WordPressInstall::FINISHED, $install?->status);
        $this->assertArrayNotHasKey('admin_password', $install->params);
        $this->assertSame(Application::TYPE_WORDPRESS, $application->fresh()?->type);
        Event::assertDispatched(ClientAreaNotificationRequested::class, fn ($e): bool => $e->type === 'user.instance.installation_finished' && $e->includeInstance);
        Http::assertNotSent(fn (Request $r): bool => $r->method() === 'DELETE');
    }

    public function test_the_default_locale_sends_no_language_and_a_subdirectory_its_path(): void
    {
        Sleep::fake();
        Event::fake([ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $this->fakeEngine();
        $application = $this->application($user);
        $this->startInstall($application, ['dir' => 'blog', 'url' => 'https://site1.example.com/blog']);

        $this->runJob($application);

        $path = '/home/site1/site1.example.com/public_html/blog';
        Http::assertSent(fn (Request $r): bool => str_ends_with($r->url(), '/wp/core/download') && $r->data() === ['path' => $path]);
        Http::assertSent(fn (Request $r): bool => str_ends_with($r->url(), '/wp/config') && $r['path'] === $path);
        Http::assertSent(fn (Request $r): bool => str_ends_with($r->url(), '/wp/core/install') && $r['path'] === $path && $r['url'] === 'https://site1.example.com/blog');
        Http::assertNotSent(fn (Request $r): bool => str_ends_with($r->url(), '/wp/language'));
        $this->assertSame(WordPressInstall::FINISHED, $application->fresh()?->wordpressInstall?->status);
    }

    /**
     * @return array<string, array{string, int, bool}>
     */
    public static function failingSteps(): array
    {
        // [failing step, status, whether the database and user existed]
        return [
            'download' => ['POST /wp/core/download', 422, false],
            'database' => ['POST /mysql/databases', 422, false],
            'config' => ['POST /wp/config', 422, true],
            'core install' => ['POST /wp/core/install', 422, true],
            'core install 5xx' => ['POST /wp/core/install', 500, true],
        ];
    }

    #[DataProvider('failingSteps')]
    public function test_a_failed_step_drops_what_the_run_created_and_notifies(string $step, int $status, bool $rolledBack): void
    {
        Sleep::fake();
        Event::fake([ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $this->fakeEngine([$step => [$status, ['message' => 'Error: the step failed.', 'errors' => ['wp' => ['Error: the step failed.']]]]]);
        $application = $this->application($user);
        $this->startInstall($application);

        $this->runJob($application);

        $deletes = array_values(array_filter($this->calls, fn (string $call): bool => str_starts_with($call, 'DELETE ')));
        if ($rolledBack) {
            $this->assertCount(2, $deletes);
            $this->assertStringStartsWith('DELETE /api/projects/site1/mysql/users/site1_wp', $deletes[0]);
            $this->assertStringStartsWith('DELETE /api/projects/site1/mysql/databases/site1_wp', $deletes[1]);
        } else {
            $this->assertSame([], $deletes);
        }

        $install = $application->fresh()?->wordpressInstall;
        $this->assertSame(WordPressInstall::FAILED, $install?->status);
        $this->assertNotNull($install->error);
        Event::assertDispatched(ClientAreaNotificationRequested::class, fn ($e): bool => $e->type === 'user.instance.installation_failed' && $e->isError && $e->includeInstance);
    }

    public function test_a_retry_finds_its_earlier_download_and_carries_on(): void
    {
        Sleep::fake();
        Event::fake([ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $this->fakeEngine(['POST /wp/core/download' => [409, ['message' => 'WordPress core files already exist.']]]);
        $application = $this->application($user);
        $this->startInstall($application);

        $this->runJob($application);

        $this->assertSame(WordPressInstall::FINISHED, $application->fresh()?->wordpressInstall?->status);
    }

    public function test_the_job_waits_for_the_create_task_and_gives_up_after_the_budget(): void
    {
        Sleep::fake(syncWithCarbon: true);
        Event::fake([ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $this->fakeEngine([], activeTasks: 2);
        $application = $this->application($user);
        $this->startInstall($application);

        $this->runJob($application);

        $this->assertSame(3, count(array_filter($this->calls, fn (string $c): bool => $c === 'GET /api/tasks')));
        $this->assertSame(WordPressInstall::FINISHED, $application->fresh()?->wordpressInstall?->status);
        Http::assertSent(function (Request $r): bool {
            parse_str((string) parse_url($r->url(), PHP_URL_QUERY), $query);

            return str_contains($r->url(), '/api/tasks') && ($query['username'] ?? null) === 'site1' && ($query['status'] ?? null) === 'active';
        });

        Carbon::setTestNow();
    }

    public function test_a_create_task_still_running_after_the_budget_fails_the_install(): void
    {
        Sleep::fake(syncWithCarbon: true);
        Event::fake([ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $this->fakeEngine([], activeTasks: 1000);
        $application = $this->application($user);
        $this->startInstall($application);

        $this->runJob($application);

        $this->assertSame(WordPressInstall::FAILED, $application->fresh()?->wordpressInstall?->status);
        $this->assertSame(InstallWordPressJob::STILL_CREATING, $application->fresh()?->wordpressInstall?->error);
        $this->assertSame([], array_values(array_filter($this->calls, fn (string $c): bool => $c !== 'GET /api/tasks' && ! str_contains($c, '/projects/all'))), implode(', ', $this->calls));
        $this->assertSame(900, InstallWordPressJob::CREATE_WAIT_SECONDS);
        $this->assertSame(5, InstallWordPressJob::POLL_SECONDS);
        $this->assertSame(600, InstallWordPressJob::ENGINE_TIMEOUT_SECONDS);
        Carbon::setTestNow();
    }

    public function test_the_safety_net_marks_a_running_install_failed(): void
    {
        Event::fake([ClientAreaNotificationRequested::class]);
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $this->startInstall($application);

        (new InstallWordPressJob($application->id))->failed(new \RuntimeException('worker died'));

        $this->assertSame(WordPressInstall::FAILED, $application->fresh()?->wordpressInstall?->status);
        $this->assertSame(InstallWordPressJob::GENERIC_FAILURE, $application->fresh()?->wordpressInstall?->error);
        Event::assertDispatched(ClientAreaNotificationRequested::class, fn ($e): bool => $e->type === 'user.instance.installation_failed');
    }

    public function test_install_refuses_a_container_project_and_a_second_install(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $container = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605-1614
        $refused = $this->actingAs($user)->postJson('/api/projects/install', ['service_id' => VirtualService::ID, 'domain_id' => $container->id]);
        // CA reads: packages/client-area/src/apis/Api.js:80 (key 0 shows the message alone)
        $refused->assertStatus(422)->assertJsonPath('errors.0.0', WordPressInstallService::NOT_CLASSIC);

        $classic = Application::query()->create(['engine_id' => $container->engine_id, 'engine_username' => 'site2', 'domain' => 'site2.example.com', 'status' => 'active', 'onboarding_at' => now()]);
        $this->startInstall($classic);
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605-1614
        $again = $this->actingAs($user)->postJson('/api/projects/install', ['service_id' => VirtualService::ID, 'domain_id' => $classic->id]);
        // CA reads: packages/client-area/src/apis/Api.js:80 (key 0 shows the message alone)
        $again->assertStatus(422)->assertJsonPath('errors.0.0', WordPressInstallService::ALREADY_INSTALLING);

        Queue::assertNotPushed(InstallWordPressJob::class);
    }

    /**
     * FX-55: the CA's create sends `domain_id` of the project the domain step
     * made. A client that names any other project - its domain is another site
     * the user already runs, here a synced classic project - must not get
     * WordPress installed into it, whatever it sends.
     */
    public function test_install_refuses_a_project_the_new_site_did_not_create(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $other = $this->syncedApplication($user);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605-1614
        $refused = $this->actingAs($user)->postJson('/api/projects/install', ['service_id' => VirtualService::ID, 'domain_id' => $other->id]);
        // CA reads: packages/client-area/src/apis/Api.js:80 (key 0 shows the message alone)
        $refused->assertStatus(422)->assertJsonPath('errors.0.0', WordPressInstallService::NOT_NEW_SITE);

        $this->assertNull($other->fresh()?->wordpressInstall);
        $this->assertSame(WordPressInstall::query()->count(), 0);
        Queue::assertNotPushed(InstallWordPressJob::class);
    }

    public function test_install_answers_404_for_an_unknown_project_or_service_and_validates(): void
    {
        Queue::fake();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605-1614
        $this->postJson('/api/projects/install', ['service_id' => VirtualService::ID, 'domain_id' => 1])->assertUnauthorized();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605-1614
        $this->actingAs($user)->postJson('/api/projects/install', ['service_id' => VirtualService::ID, 'domain_id' => 999])->assertNotFound();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605-1614
        $this->actingAs($user)->postJson('/api/projects/install', ['service_id' => 999, 'domain_id' => $application->id])->assertNotFound();
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605-1614
        $invalid = $this->actingAs($user)->postJson('/api/projects/install', ['service_id' => VirtualService::ID, 'domain_id' => $application->id, 'dir' => '../etc', 'admin_password' => 'short']);
        // CA reads: packages/client-area/src/apis/Api.js:80 (field errors)
        $invalid->assertStatus(422)->assertJsonValidationErrors(['dir', 'admin_password']);

        Queue::assertNotPushed(InstallWordPressJob::class);
    }

    public function test_install_refuses_a_version_the_panel_does_not_offer(): void
    {
        Queue::fake();
        $user = User::factory()->create(['email' => 'owner@example.com']);
        $application = $this->application($user);
        $this->fakeEngine(offers: [['version' => '6.8.1'], ['version' => '6.7.2']]);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605-1614
        $refused = $this->actingAs($user)->postJson('/api/projects/install', [
            'service_id' => VirtualService::ID,
            'domain_id' => $application->id,
            'install_method' => 'simple',
            'version' => '9.9.9',
        ]);
        // CA reads: packages/client-area/src/apis/Api.js:80 (field errors)
        $refused->assertStatus(422)->assertJsonValidationErrors(['version' => InstallWordPressRequest::VERSION_NOT_OFFERED]);

        $this->assertNull($application->fresh()?->wordpressInstall);
        Queue::assertNotPushed(InstallWordPressJob::class);

        // An offered version still starts the install.
        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1605-1614
        $this->actingAs($user)->postJson('/api/projects/install', [
            'service_id' => VirtualService::ID,
            'domain_id' => $application->id,
            'install_method' => 'simple',
            'version' => '6.8.1',
        ])->assertCreated();
        $this->assertSame('6.8.1', $application->fresh()?->wordpressInstall?->params['version']);
    }

    public function test_retry_install_reruns_a_failed_install_only(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $this->startInstall($application);
        $application->wordpressInstall?->update(['status' => WordPressInstall::FAILED, 'error' => 'boom']);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1643-1654
        $retry = $this->actingAs($user)->putJson("/api/projects/{$application->id}/retry-install", []);
        // CA reads: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1650 (the instance, installing again)
        $retry->assertOk()->assertJsonPath('data.async_status.installation', 'in_progress');
        Queue::assertPushed(InstallWordPressJob::class, 1);
        $this->assertSame(WordPressInstall::IN_PROGRESS, $application->fresh()?->wordpressInstall?->status);
        $this->assertNull($application->fresh()?->wordpressInstall?->error);

        // CA: packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1643-1654
        $again = $this->actingAs($user)->putJson("/api/projects/{$application->id}/retry-install", []);
        // CA reads: packages/client-area/src/apis/Api.js:80 (key 0 shows the message alone)
        $again->assertStatus(422)->assertJsonPath('errors.0.0', 'Cannot retry installation on this instance.');
        Queue::assertPushed(InstallWordPressJob::class, 1);
    }

    /**
     * @return array<string, array{?string, ?string}>
     */
    public static function languages(): array
    {
        return [
            'no language' => [null, null],
            'en' => ['en', null],
            'en_US' => ['en_US', null],
            'old default' => ['english', null],
            'Polish' => ['pl_PL', 'pl_PL'],
            'not a locale' => ['Polski!', null],
        ];
    }

    #[DataProvider('languages')]
    public function test_the_language_maps_to_a_wordpress_locale(?string $language, ?string $locale): void
    {
        $this->assertSame($locale, WordPressInstallService::locale($language));
    }
}
