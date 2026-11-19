<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\EngineText;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Per-endpoint matrix for the projects / staging / deploy area
 * (the routes served by `Http/Controllers/Project/{Project,Staging,DeployLog,
 * Screenshot,Reporting,DomainChange,InstanceSsl,AppUser,ProjectLabel}Controller`):
 *
 *  - unauthenticated -> 401;
 *  - unknown application -> 404 (Community is single-user, so there is no foreign
 *    project to hide behind a 404; the binding's `findForUser` is the single
 *    visibility gate);
 *  - Engine down -> 503 on a connection error, 502 on an Engine 5xx
 *    (`EngineUnavailableException::httpStatus` / `EngineRequestException::httpStatus`).
 *
 * The missing-privilege -> 403 case is already covered exhaustively, per route
 * with `denyPrivilege(<its own privilege>)`, by
 * {@see PrivilegeAssignmentTest::test_a_privileged_route_answers_403_without_its_privilege}
 * (generated from the real router), so it is not duplicated here.
 *
 * The two routes that deliberately degrade instead of failing are pinned by
 * their own test, never by a wrong status:
 *  - `GET deploy-logs/live` reports `{panel:null, engine:null}` when the Engine
 *    is down (`DeployHistoryService::live` catches `EngineException`);
 *  - `GET staging/pre-check-disk-usage` answers its all-null shape
 *    (`StagingService::preCheck` catches and returns partial data,
 *    `Projects/StagingService.php:290`).
 *
 * CA call sites (request body and the keys read) per route family:
 *   GET    projects                      packages/client-area/src/apis/Instances.js:76
 *   GET    projects/{id}                packages/client-area/src/apis/Instances.js:17
 *   DELETE projects/{id}                packages/client-area/src/mixins/InstanceActionsMixin.js:386
 *   POST   staging                      packages/client-area/src/components/modal/CreateStagingModal.vue:307
 *   PUT    retry-staging/{id}           packages/client-area/src/components/modal/CreateStagingModal.vue:313
 *   PUT    push-to-live                 packages/client-area/src/mixins/InstanceActionsMixin.js:563
 *   PUT    push-to-staging              packages/client-area/src/mixins/InstanceActionsMixin.js:793
 *   GET    staging/pre-check-disk-usage packages/client-area/src/components/modal/CreateStagingModal.vue:289
 *   POST   copy                         packages/client-area/src/views/instance/advanced/CopyInstance.vue:235
 *   GET    logs                         packages/client-area/src/router/fetchData.js:15
 *   PUT    retry-install                packages/client-area/src/components/onboarding/OnboardingModalWrapper.vue:1654
 *   POST   deploy/upload                packages/client-area/src/components/modal/FilesUploadVersionModal.vue:500
 *   POST   redeploy                     packages/client-area/src/components/modal/FilesUploadVersionModal.vue:518
 *   GET    deploy-logs                  packages/client-area/src/apis/Instances.js:24
 *   GET    deploy-logs/live             packages/client-area/src/apis/Instances.js:34
 *   GET    deploy-logs/{id}             packages/client-area/src/apis/Instances.js:29
 *   GET    deploy-logs/{id}/download    packages/client-area/src/apis/Instances.js:44
 *   POST   deploy-cancel                packages/client-area/src/apis/Instances.js:39
 *   GET    screenshot(.jpg)             packages/client-area/src/apis/Instances.js:141
 *   POST   refresh-thumbnail            packages/client-area/src/components/cards/SiteDetailsInfoCard.vue:115
 *   GET    users / users-roles          packages/client-area/src/views/instance/advanced/Users.vue:175,256
 *   POST   users                        packages/client-area/src/views/instance/advanced/Users.vue:364
 *   DELETE users/{id}                   packages/client-area/src/views/instance/advanced/Users.vue:494
 *   PUT    users/{id}/reset-password    packages/client-area/src/views/instance/advanced/Users.vue:436
 *   POST   users/{id}/sso-url           packages/client-area/src/components/modal/AppSsoModal.vue:269
 *   POST   users/{id}/sso-preview-url   packages/client-area/src/components/modal/AppSsoModal.vue:298
 *   POST   preview                      packages/client-area/src/components/modal/PreviewSiteModal.vue:132
 *   POST   sso-preview-url              packages/client-area/src/components/modal/WpAdminSsoModal.vue:301
 *   GET    change-domain/options        packages/client-area/src/components/modal/SetYourDomainModal.vue:578
 *   PUT    change-domain/domain         packages/client-area/src/components/modal/SetYourDomainModal.vue:746
 *   PUT    change-domain/subdomain      packages/client-area/src/components/modal/SetYourDomainModal.vue:767
 *   GET    ssl/certificate/detected-by-url packages/client-area/src/components/cards/SecurityInfoCard.vue:199
 *   GET    reporting/{type}/{period}  packages/client-area/src/views/instance/General.vue:226,309
 *   POST   labels / DELETE labels       packages/client-area/src/router/fetchData.js:236,254
 *
 * @see packages/api/routes/api.php:154-205 (old /instance routes)
 */
class ProjectRouteMatrixTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        // The SSL probe resolves the Engine host as a fallback; never touch DNS.
        $this->fakeHostResolver();
        $this->fakePinnedProbe();
    }

    /**
     * The project-area controllers this matrix covers; the git, WordPress,
     * onboarding and log routes have their own matrices.
     *
     * @return list<class-string>
     */
    private static function projectControllers(): array
    {
        $root = 'PanelAlpha\\ClientArea\\Http\\Controllers\\Project\\';

        return [
            $root.'ProjectController',
            $root.'StagingController',
            $root.'DeployLogController',
            // The deploy history, read from the Engine.
            $root.'DeployHistoryController',
            $root.'ScreenshotController',
            $root.'ReportingController',
            $root.'DomainChangeController',
            \PanelAlpha\ClientArea\Http\Controllers\Project\InstanceSslController::class,
            $root.'AppUserController',
            $root.'ProjectLabelController',
            // The project preview and the WordPress preview SSO.
            $root.'PreviewController',
            // The Source card's inspect + deploy history read.
            $root.'ProjectSourceController',
        ];
    }

    /**
     * One case per project-area route: method, URI template, the privilege the
     * route carries (null for the reads the old panel left open) and the CA
     * call site the matrix's request stub stands for.
     *
     * @return array<string, array{string, string, string|null, string}>
     */
    public static function projectRoutes(): array
    {
        return [
            'GET projects' => ['GET', 'projects', null, 'src/apis/Instances.js:76'],
            'GET projects/{application}' => ['GET', 'projects/{application}', null, 'src/apis/Instances.js:17'],
            'DELETE projects/{application}' => ['DELETE', 'projects/{application}', 'general.delete_instance', 'src/mixins/InstanceActionsMixin.js:386'],
            'POST staging' => ['POST', 'projects/{application}/staging', 'general.create_staging', 'src/components/modal/CreateStagingModal.vue:307'],
            'PUT retry-staging' => ['PUT', 'projects/{application}/retry-staging/{stagingId}', 'general.create_staging', 'src/components/modal/CreateStagingModal.vue:313'],
            'PUT push-to-live' => ['PUT', 'projects/{application}/push-to-live', 'general.push_to_live', 'src/mixins/InstanceActionsMixin.js:563'],
            'PUT push-to-staging' => ['PUT', 'projects/{application}/push-to-staging', 'general.push_to_staging', 'src/mixins/InstanceActionsMixin.js:793'],
            'GET push-to-live' => ['GET', 'projects/{application}/push-to-live', null, 'src/mixins/OpenModalAction.js:143'],
            'GET push-to-staging' => ['GET', 'projects/{application}/push-to-staging', 'general.push_to_staging', 'src/mixins/OpenModalAction.js:188'],
            'GET staging/pre-check-disk-usage' => ['GET', 'projects/{application}/staging/pre-check-disk-usage', 'general.create_staging', 'src/components/modal/CreateStagingModal.vue:289'],
            'POST copy' => ['POST', 'projects/{application}/copy', 'general.copy_instance', 'src/views/instance/advanced/CopyInstance.vue:235'],
            'GET logs' => ['GET', 'projects/{application}/logs', 'general.view_logs', 'src/router/fetchData.js:15'],
            'POST labels' => ['POST', 'projects/{application}/labels', 'general.manage_labels', 'src/router/fetchData.js:236'],
            'DELETE labels' => ['DELETE', 'projects/{application}/labels', 'general.manage_labels', 'src/router/fetchData.js:254'],
            'PUT retry-install' => ['PUT', 'projects/{application}/retry-install', 'service.create_instance', 'src/components/onboarding/OnboardingModalWrapper.vue:1654'],
            'POST deploy/upload' => ['POST', 'projects/{application}/deploy/upload', 'general.redeploy', 'src/components/modal/FilesUploadVersionModal.vue:500'],
            'POST redeploy' => ['POST', 'projects/{application}/redeploy', 'general.redeploy', 'src/components/modal/FilesUploadVersionModal.vue:518'],
            'GET deploy-logs' => ['GET', 'projects/{application}/deploy-logs', 'general.view_logs', 'src/apis/Instances.js:24'],
            'GET deploy-logs/live' => ['GET', 'projects/{application}/deploy-logs/live', 'general.view_logs', 'src/apis/Instances.js:34'],
            'GET deploy-logs/{logId}' => ['GET', 'projects/{application}/deploy-logs/{logId}', 'general.view_logs', 'src/apis/Instances.js:29'],
            'GET deploy-logs/{logId}/download' => ['GET', 'projects/{application}/deploy-logs/{logId}/download', 'general.view_logs', 'src/apis/Instances.js:44'],
            'POST deploy-cancel' => ['POST', 'projects/{application}/deploy-cancel', 'service.create_instance', 'src/apis/Instances.js:39'],
            'GET source' => ['GET', 'projects/{application}/source', null, 'src/apis/Instances.js (Instances.projectSource)'],
            'GET screenshot' => ['GET','projects/{application}/screenshot', null, 'src/apis/Instances.js:141'],
            'GET screenshot.jpg' => ['GET', 'projects/{application}/screenshot.jpg', null, 'src/apis/Instances.js:141'],
            // The CA builds these URLs by hand, so the /instances alias is used.
            'GET instances/screenshot.jpg' => ['GET', 'instances/{application}/screenshot.jpg', null, 'src/apis/Instances.js:141'],
            'POST refresh-thumbnail' => ['POST', 'projects/{application}/refresh-thumbnail', 'general.refresh_thumbnail', 'src/components/cards/SiteDetailsInfoCard.vue:115'],
            'POST instances/refresh-thumbnail' => ['POST', 'instances/{application}/refresh-thumbnail', 'general.refresh_thumbnail', 'src/components/cards/SiteDetailsInfoCard.vue:115'],
            'GET users' => ['GET', 'projects/{application}/users', null, 'src/views/instance/advanced/Users.vue:175'],
            'GET users-roles' => ['GET', 'projects/{application}/users-roles', null, 'src/views/instance/advanced/Users.vue:256'],
            'POST users' => ['POST', 'projects/{application}/users', 'general.manage_users', 'src/views/instance/advanced/Users.vue:364'],
            'DELETE users/{userId}' => ['DELETE', 'projects/{application}/users/{userId}', 'general.manage_users', 'src/views/instance/advanced/Users.vue:494'],
            'PUT users/{userId}/reset-password' => ['PUT', 'projects/{application}/users/{userId}/reset-password', 'general.manage_users', 'src/views/instance/advanced/Users.vue:436'],
            'POST users/{userId}/sso-url' => ['POST', 'projects/{application}/users/{userId}/sso-url', 'general.manage_users', 'src/components/modal/AppSsoModal.vue:269'],
            // The three preview routes the CA called into a 404.
            'POST users/{userId}/sso-preview-url' => ['POST', 'projects/{application}/users/{userId}/sso-preview-url', 'general.manage_users', 'src/components/modal/AppSsoModal.vue:298'],
            'POST preview' => ['POST', 'projects/{application}/preview', 'general.preview_instance', 'src/components/modal/PreviewSiteModal.vue:132'],
            'POST sso-preview-url' => ['POST', 'projects/{application}/sso-preview-url', 'wordpress.create_sso_link', 'src/components/modal/WpAdminSsoModal.vue:301'],
            'GET change-domain/options' => ['GET', 'projects/{application}/change-domain/options', null, 'src/components/modal/SetYourDomainModal.vue:578'],
            'PUT change-domain/domain' => ['PUT', 'projects/{application}/change-domain/domain', 'general.change_domain', 'src/components/modal/SetYourDomainModal.vue:746'],
            'PUT change-domain/subdomain' => ['PUT', 'projects/{application}/change-domain/subdomain', 'general.change_domain', 'src/components/modal/SetYourDomainModal.vue:767'],
            'GET detected-by-url' => ['GET', 'projects/{application}/ssl/certificate/detected-by-url', null, 'src/components/cards/SecurityInfoCard.vue:199'],
            'GET instances/detected-by-url' => ['GET', 'instances/{application}/ssl/certificate/detected-by-url', null, 'src/components/cards/SecurityInfoCard.vue:199'],
            'GET reporting/bandwidth' => ['GET', 'projects/{application}/reporting/bandwidth/{period}', 'general.view_reports', 'src/views/instance/General.vue:309'],
            'GET reporting/visitors' => ['GET', 'projects/{application}/reporting/visitors/{period}', 'general.view_reports', 'src/views/instance/General.vue:226'],
            'GET reporting/breakdown' => ['GET', 'projects/{application}/reporting/{type}/{period}', 'general.view_reports', 'src/views/instance/Monitoring.vue:278'],
        ];
    }

    /**
     * The route template with every placeholder filled so the router matches
     * it (`whereNumber`, `whereIn`).
     */
    private function uri(string $template, int $applicationId): string
    {
        return '/api/'.strtr($template, [
            '{application}' => (string) $applicationId,
            '{stagingId}' => '2',
            // An Engine deploy id (the panel row number before).
            '{logId}' => '20261014-101500-a1b2c3',
            '{userId}' => '2',
            '{period}' => 'last-week',
            '{type}' => 'visits-by-country',
        ]);
    }

    /**
     * The CA sends these reads without a body; the mutations get a minimal valid
     * body so the test fails on the auth/binding status, not on validation.
     *
     * @return array<string, mixed>
     */
    private function bodyFor(string $template): array
    {
        return match ($template) {
            'projects/{application}/staging' => ['domain' => 'staging.example.com'],
            'projects/{application}/retry-staging/{stagingId}' => ['domain' => 'staging.example.com'],
            'projects/{application}/push-to-live',
            'projects/{application}/push-to-staging' => ['overwrite_files' => true, 'push_db' => true],
            'projects/{application}/copy' => ['service_id' => 1],
            'projects/{application}/labels' => ['title' => 'Prod'],
            'projects/{application}/redeploy' => ['remote_filepath' => 'project/.panelalpha-upload/site.zip'],
            'projects/{application}/change-domain/domain' => ['domain' => 'shop.example.com'],
            'projects/{application}/change-domain/subdomain' => ['subdomain' => 'shop', 'domain' => 'panelalpha.online'],
            'projects/{application}/sso-preview-url' => ['user' => 1],
            default => [],
        };
    }

    #[DataProvider('projectRoutes')]
    public function test_a_project_route_requires_authentication(string $method, string $template, ?string $privilege, string $citation = ''): void
    {
        // CA: src/apis/Instances.js:17 (the CA always calls a project route from an authenticated page)
        $this->json($method, $this->uri($template, 1), $this->bodyFor($template))->assertUnauthorized();
    }

    /**
     * The project routes that bind an application; `GET projects` binds none, so
     * it has no 404 to pin.
     *
     * @return array<string, array<int, mixed>>
     */
    public static function applicationBoundProjectRoutes(): array
    {
        return array_filter(self::projectRoutes(), static fn (array $route): bool => str_contains((string) $route[1], '{application}'));
    }

    #[DataProvider('applicationBoundProjectRoutes')]
    public function test_a_project_route_answers_404_for_an_unknown_application(string $method, string $template, ?string $privilege, string $citation = ''): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        // A project id the user cannot see: the binding's `findForUser` is the
        // one visibility gate.
        // CA: src/apis/Instances.js:17 (a project id the CA no longer has)
        $this->actingAs($user)
            ->json($method, $this->uri($template, 999999), $this->bodyFor($template))
            ->assertNotFound();
    }

    /**
     * The Engine-calling project routes with the setup their scenario needs and
     * the status each maps a down Engine to. The two deliberately degrading
     * routes are excluded and pinned separately.
     *
     * @return array<string, array{string, string, string, array<string, mixed>}>
     */
    public static function engineCallingProjectRoutes(): array
    {
        return [
            'DELETE project' => ['DELETE', 'projects/{application}', 'plain', ['remove_data' => true, 'remove_database' => true, 'confirm' => true]],
            'POST redeploy' => ['POST', 'projects/{application}/redeploy', 'dind', ['remote_filepath' => 'project/.panelalpha-upload/site.zip']],
            'PUT retry-install' => ['PUT', 'projects/{application}/retry-install', 'failed-install', []],
            'POST deploy-cancel' => ['POST', 'projects/{application}/deploy-cancel', 'dind', []],
            'POST staging' => ['POST', 'projects/{application}/staging', 'custom', ['domain' => 'staging.example.com']],
            'PUT push-to-live' => ['PUT', 'projects/{application}/push-to-live', 'custom-staging', ['overwrite_files' => true, 'push_db' => true]],
            'GET push-to-live' => ['GET', 'projects/{application}/push-to-live', 'custom-staging', []],
            'GET push-to-staging' => ['GET', 'projects/{application}/push-to-staging', 'custom-live-with-staging', []],
            'GET change-domain/options' => ['GET', 'projects/{application}/change-domain/options', 'plain', []],
            // Section K: both change routes rename on the Engine and must surface a
            // down Engine (criterion 5).
            'PUT change-domain/domain' => ['PUT', 'projects/{application}/change-domain/domain', 'plain', ['domain' => 'shop.example.com']],
            'PUT change-domain/subdomain' => ['PUT', 'projects/{application}/change-domain/subdomain', 'plain', ['subdomain' => 'shop', 'domain' => 'panelalpha.online']],
            'GET reporting/bandwidth' => ['GET', 'projects/{application}/reporting/bandwidth/last-week', 'plain', []],
            'GET reporting/breakdown' => ['GET', 'projects/{application}/reporting/{type}/{period}', 'plain', []],
            'GET app users' => ['GET', 'projects/{application}/users', 'dind', []],
            // Section J: every app-user route calls the Engine; the reads and the
            // mutations must surface a down Engine (criterion 5).
            'GET app users-roles' => ['GET', 'projects/{application}/users-roles', 'dind', []],
            'POST app users' => ['POST', 'projects/{application}/users', 'dind', ['username' => 'editor', 'email' => 'editor@example.com', 'password' => 'Secret-Password1!', 'role' => 'user']],
            'DELETE app user' => ['DELETE', 'projects/{application}/users/{userId}', 'dind', []],
            'PUT app user reset-password' => ['PUT', 'projects/{application}/users/{userId}/reset-password', 'dind', ['password' => 'Secret-Password1!']],
            'POST app user sso-url' => ['POST', 'projects/{application}/users/{userId}/sso-url', 'dind', []],
            // The preview tunnel list is the first Engine call.
            'POST app user sso-preview-url' => ['POST', 'projects/{application}/users/{userId}/sso-preview-url', 'dind', []],
            'POST preview' => ['POST', 'projects/{application}/preview', 'custom', []],
            // The WordPress preview SSO lists the tunnels first.
            'POST sso-preview-url' => ['POST', 'projects/{application}/sso-preview-url', 'plain', ['user' => 1]],
            // The deploy history reads the Engine's.
            'GET deploy-logs' => ['GET', 'projects/{application}/deploy-logs', 'dind', []],
            'GET deploy-logs/{logId}' => ['GET', 'projects/{application}/deploy-logs/{logId}', 'dind', []],
            'GET deploy-logs/{logId}/download' => ['GET', 'projects/{application}/deploy-logs/{logId}/download', 'dind', []],
        ];
    }

    /**
     * Sync the project the scenario needs and return it.
     *
     * @param  array<string, mixed>  $project
     */
    private function scenarioApplication(User $user, string $scenario): Application
    {
        $project = match ($scenario) {
            'dind' => ['details' => ['template' => 'dind']],
            // The Engine kept the project after its install
            // failed (FailureRetention.php:31-39); git, as an archive retry is refused.
            'failed-install' => ['details' => ['template' => 'dind', 'git_repo' => 'https://github.com/acme/site', 'deployment_status' => 'failed']],
            default => [],
        };

        if ($scenario === 'failed-install') {
            // Nothing is retrying the failed install.
            $this->fakeEngineDeploys('site1', [$this->engineDeploy(['status' => 'failed', 'kind' => 'install'])]);
        }

        $application = $this->syncedApplication($user, 'site1', $project);

        if (in_array($scenario, ['custom', 'custom-staging', 'custom-live-with-staging'], true)) {
            $application->update(['type' => Application::TYPE_CUSTOM]);
        }

        if (in_array($scenario, ['custom-staging', 'custom-live-with-staging'], true)) {
            Application::query()->create([
                'engine_id' => $application->engine_id,
                'engine_username' => 'site1-staging',
                'domain' => 'staging.site1.example.com',
                'status' => 'active',
                'type' => Application::TYPE_CUSTOM,
                'staging_of_id' => $application->id,
            ]);
        }

        return $application;
    }

    #[DataProvider('engineCallingProjectRoutes')]
    public function test_a_project_route_answers_503_when_the_engine_connection_fails(string $method, string $template, string $scenario, array $body): void
    {
        $user = User::factory()->create();
        // The application is the *staging* for push-to-live (its URI takes the
        // staging id), and the live parent for every other route.
        $application = $this->scenarioApplication($user, $scenario);

        if ($scenario === 'custom-staging') {
            $application = Application::query()->where('engine_username', 'site1-staging')->firstOrFail();
        }

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('Engine down')]);

        // CA: src/apis/Instances.js:17 (the CA surfaces the 503, `Api.getErrorMessage`)
        $response = $this->actingAs($user)
            ->json($method, $this->uri($template, $application->id), $body)
            ->assertStatus(503);

        $this->assertSame(json_encode(['message' => EngineText::SAFE_UNAVAILABLE]), $response->getContent());
    }

    #[DataProvider('engineCallingProjectRoutes')]
    public function test_a_project_route_answers_502_when_the_engine_answers_5xx(string $method, string $template, string $scenario, array $body): void
    {
        $user = User::factory()->create();
        $application = $this->scenarioApplication($user, $scenario);

        if ($scenario === 'custom-staging') {
            $application = Application::query()->where('engine_username', 'site1-staging')->firstOrFail();
        }

        // Engine: core/app/Http/Controllers/Controller.php:21 (the Engine's 5xx body)
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 500)]);

        // A 5xx is the Engine's fault, not the user's: `EngineRequestException`
        // renders it 502, not 503 (`EngineRequestException::httpStatus`).
        // CA: src/apis/Instances.js:17
        $this->actingAs($user)
            ->json($method, $this->uri($template, $application->id), $body)
            ->assertStatus(502);
    }

    public function test_the_live_deploy_view_degrades_when_the_engine_is_down(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('Engine down')]);

        // `DeployHistoryService::live` reports both halves as absent instead of
        // failing the poll (Projects/DeployHistoryService.php).
        // CA: src/apis/Instances.js:34
        // CA reads: src/apis/Instances.js:34 (`response.data.data.panel`, `.engine`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/deploy-logs/live?offset=0")
            ->assertOk()
            ->assertJsonPath('data.panel', null)
            ->assertJsonPath('data.engine', null);
    }

    public function test_the_staging_disk_pre_check_degrades_when_the_engine_is_down(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1');

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('Engine down')]);

        // `StagingService::preCheck` catches the Engine error and returns its
        // all-null partial answer, never a 5xx (Projects/StagingService.php:290).
        // CA: src/components/modal/CreateStagingModal.vue:289
        // CA reads: src/components/modal/CreateStagingModal.vue:290 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/staging/pre-check-disk-usage")
            ->assertOk()
            ->assertJsonPath('data.account_usage', null)
            ->assertJsonPath('data.wordpress_dir_usage', null);
    }

    public function test_the_matrix_provider_covers_every_project_area_route(): void
    {
        $registered = [];
        foreach (Route::getRoutes() as $route) {
            $controller = str_contains($route->getActionName(), '@')
                ? explode('@', $route->getActionName())[0]
                : $route->getActionName();
            if (! in_array($controller, self::projectControllers(), true)) {
                continue;
            }
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $registered[$method.' '.$route->uri()] = true;
            }
        }

        $matrix = [];
        foreach (self::projectRoutes() as [$method, $template]) {
            $matrix[$method.' api/'.$template] = true;
        }

        $this->assertSame(
            [],
            array_keys(array_diff_key($registered, $matrix)),
            'A registered project-area route is missing from the matrix provider.',
        );
    }
}
