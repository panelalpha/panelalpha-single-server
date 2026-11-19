<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Activity\ActivityLogService;
use PanelAlpha\ClientArea\Containers\ContainerService;
use PanelAlpha\ClientArea\Hosting\EnvFileParser;
use PanelAlpha\ClientArea\Hosting\FirstEngineBackupContainer;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Http\Requests\Hosting\PhpSettingsRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\BackupStoreRequest;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\DeleteAndRecreateStagingRetrier;
use PanelAlpha\ClientArea\Projects\OnboardingService;
use PanelAlpha\ClientArea\Projects\StagingService;
use PanelAlpha\ClientArea\Services\HostingService;
use PanelAlpha\ClientArea\Support\SimpleServiceOnboarding;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionMethod;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Staging, container, activity and request-helper branches that the route
 * tests do not reach.
 */
class StagingAndSmallBranchesGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(array $details = []): Application
    {
        return $this->syncedApplication(User::factory()->create(), 'site1', ['details' => $details]);
    }

    private function stagingOf(Application $parent, array $attributes = []): Application
    {
        return Application::query()->create($attributes + [
            'engine_id' => $parent->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $parent->id,
        ]);
    }

    // ---- StagingService -------------------------------------------------

    public function test_a_staging_the_engine_answers_without_a_project_is_a_bad_gateway(): void
    {
        $parent = $this->application();

        // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController (a 202 whose project has no username)
        Http::fake(['engine.example.com/api/projects/site1/staging' => Http::response(['data' => [], 'task_id' => 5], 202)]);
        $this->fakeEngineDeploys('site1');

        try {
            app(StagingService::class)->create($parent, []);
            $this->fail('A staging without a project cannot be mirrored.');
        } catch (EngineRequestException $e) {
            $this->assertSame(502, $e->engineStatus);
        }
    }

    public function test_a_staging_of_a_failed_project_is_refused(): void
    {
        $parent = $this->application();
        $parent->forceFill(['status' => 'failed'])->save();

        $this->expectExceptionObject(ValidationException::withMessages([StagingService::INVALID_ACTION]));

        app(StagingService::class)->create($parent->fresh(), []);
    }

    public function test_pushing_a_project_that_has_no_live_parent_is_refused(): void
    {
        $application = $this->application();

        try {
            // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController::push (never reached: no parent)
            app(StagingService::class)->pushToLive($application, []);
            $this->fail('A live project has nothing to push to.');
        } catch (ValidationException $e) {
            $this->assertSame(['The project has no live parent to push to.'], $e->errors()['application']);
        }
    }

    public function test_pushing_a_project_that_has_no_staging_is_refused(): void
    {
        $application = $this->application();

        try {
            // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController::push (never reached: no staging)
            app(StagingService::class)->pushToStaging($application, []);
            $this->fail('A project without a staging has nothing to push to.');
        } catch (ValidationException $e) {
            $this->assertSame(['The project has no staging to push to.'], $e->errors()['application']);
        }
    }

    public function test_the_push_diff_of_a_project_that_has_no_staging_is_refused(): void
    {
        $application = $this->application();

        try {
            // Engine: core/app/Http/Controllers/User/StagingController.php:281 -> StagingController::pushDiff (never reached: no staging)
            app(StagingService::class)->pushToStagingDiff($application);
            $this->fail('A project without a staging has nothing to compare.');
        } catch (ValidationException $e) {
            $this->assertSame(['The project has no staging to push to.'], $e->errors()['application']);
        }
    }

    public function test_the_push_diff_skips_a_table_the_engine_names_without_its_database(): void
    {
        $live = $this->application();
        $this->stagingOf($live);

        // Engine: core/app/Http/Controllers/User/StagingController.php:281 -> StagingController::pushDiff (one complete table, one without a database)
        Http::fake(['engine.example.com/api/projects/site1/push/diff*' => Http::response(['data' => [
            'tables_structure_diff' => [['database' => 'site1_wp', 'name' => 'wp_posts'], ['name' => 'wp_orphan']],
            'tables_data_diff' => [],
        ]])]);

        // Engine: core/app/Http/Controllers/User/StagingController.php:281 -> StagingController::pushDiff
        $diff = app(StagingService::class)->pushToStagingDiff($live);

        $this->assertSame(['site1_wp.wp_posts'], $diff['tables_structure_diff']);
    }

    public function test_a_staging_retry_that_cannot_delete_the_failed_copy_rethrows_the_engine_error(): void
    {
        $parent = $this->application();
        $staging = $this->stagingOf($parent, ['staging_create_failed_at' => now()]);

        // Engine: core/app/Http/Controllers/UserController.php:1229 -> UserController::destroy (Engine 5xx)
        Http::fake(['engine.example.com/api/projects/site1-staging' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        app(DeleteAndRecreateStagingRetrier::class)->retry($parent, $staging, []);
    }

    public function test_a_staging_retry_whose_new_copy_has_no_project_is_a_bad_gateway(): void
    {
        $parent = $this->application();
        $staging = $this->stagingOf($parent, ['staging_create_failed_at' => now()]);

        // Engine: core/app/Http/Controllers/UserController.php:1229 -> UserController::destroy
        // Engine: core/app/Http/Controllers/User/StagingController.php:253-256 -> StagingController (a 202 whose project has no username)
        Http::fake([
            'engine.example.com/api/projects/site1-staging' => Http::response(null, 204),
            'engine.example.com/api/projects/site1/staging' => Http::response(['data' => [], 'task_id' => 5], 202),
        ]);

        try {
            app(DeleteAndRecreateStagingRetrier::class)->retry($parent, $staging, []);
            $this->fail('A copy without a project cannot be mirrored.');
        } catch (EngineRequestException $e) {
            $this->assertSame(502, $e->engineStatus);
        }
    }

    // ---- ContainerService, FirstEngineBackupContainer, onboarding --------

    public function test_the_container_list_keeps_a_project_whose_containers_cannot_be_read(): void
    {
        $user = User::factory()->create();
        $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);

        // Engine: core/app/Http/Controllers/User/ContainerController.php:82 -> index (Engine 5xx)
        Http::fake(['engine.example.com/api/projects/site1/containers' => Http::response(['message' => 'boom'], 500)]);

        $groups = app(ContainerService::class)->groupsFor($user);

        $this->assertCount(1, $groups);
        $this->assertSame([], $groups[0]['containers']);
    }

    public function test_the_first_engine_container_is_none_when_the_engine_has_no_backup_container(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/BackupContainerController.php:31 -> index
        Http::fake(['engine.example.com/api/backup-containers' => Http::response(['data' => []])]);

        $destination = new FirstEngineBackupContainer;

        $this->assertNull($destination->containerFor($application));
        $this->assertNull($destination->keepLastFor($application));
    }

    public function test_the_simple_onboarding_blocks_no_theme_and_generates_no_domain(): void
    {
        $service = new HostingService(id: 1, planName: 'Community');
        $onboarding = new SimpleServiceOnboarding;

        $this->assertSame([], $onboarding->blockedThemes($service));
        $this->assertNull($onboarding->generatedDomain($service, 'My site'));
    }

    public function test_the_git_branches_of_an_unparsable_repository_are_a_generic_failure(): void
    {
        $this->configureEngine();

        $result = app(OnboardingService::class)->gitBranches('not a repository');

        $this->assertFalse($result['success']);
        $this->assertSame([], $result['branches']);
    }

    public function test_an_empty_default_branch_the_engine_reports_is_no_default(): void
    {
        $this->configureEngine();
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

        // Engine: core/app/Http/Controllers/SourceRefsController.php:80 -> refs (an empty default branch)
        Http::fake(['engine.example.com/api/source/refs' => Http::response(['data' => ['branches' => ['main'], 'default_branch' => '']])]);

        $result = app(OnboardingService::class)->gitBranches('https://github.com/acme/site');

        $this->assertTrue($result['success']);
        $this->assertNull($result['default_branch']);
    }

    // ---- .env parser, requests and the activity log ----------------------

    public function test_serialise_skips_a_variable_without_a_key_and_writes_an_empty_value_bare(): void
    {
        $rows = [
            ['type' => 'variable', 'key' => '', 'value' => 'lost'],
            ['type' => 'variable', 'key' => 'EMPTY', 'value' => ''],
            ['type' => 'variable', 'key' => 'NAME', 'value' => 'a b'],
        ];

        $this->assertSame("EMPTY=\nNAME=\"a b\"\n", EnvFileParser::serialise($rows));
    }

    public function test_the_php_settings_ignore_rows_that_are_not_directives(): void
    {
        $request = PhpSettingsRequest::create('/x', 'PUT', [
            'junk',
            ['directive' => '', 'value' => '1'],
            ['directive' => 'memory_limit', 'value' => '256M'],
            ['directive' => 'display_errors'],
        ]);

        $this->assertSame(['memory_limit' => '256M', 'display_errors' => ''], $request->settings());
    }

    /**
     * @return array<string, array{string, bool, bool}>
     */
    public static function backupTypeProvider(): array
    {
        return [
            'database only' => ['database', false, true],
            'files only' => ['directory', true, false],
        ];
    }

    #[DataProvider('backupTypeProvider')]
    public function test_a_backup_type_sets_the_files_and_database_choice(string $type, bool $files, bool $database): void
    {
        $request = BackupStoreRequest::create('/x', 'POST', ['backupType' => $type]);
        (new ReflectionMethod($request, 'prepareForValidation'))->invoke($request);

        $this->assertSame($files, $request->input('backupDirectory'));
        $this->assertSame($database, $request->input('backupDatabase'));
    }

    public function test_the_activity_log_search_matches_the_action_the_uri_and_the_payload(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        foreach ([['user.instance.delete', '/api/a', ['note' => 'one']], ['user.instance.copy', '/api/b', ['note' => 'needle']]] as [$action, $uri, $payload]) {
            ActivityLog::query()->create([
                'action' => $action,
                'user_id' => $user->id,
                'application_id' => $application->id,
                'request_method' => 'POST',
                'request_uri' => $uri,
                'payload' => $payload,
            ]);
        }

        $result = app(ActivityLogService::class)->paginate($application, ['search_term' => 'needle']);

        $this->assertSame(['user.instance.copy'], $result['logs']->pluck('action')->all());
    }
}
