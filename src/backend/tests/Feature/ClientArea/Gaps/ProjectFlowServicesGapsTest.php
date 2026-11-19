<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\DeployHistoryService;
use PanelAlpha\ClientArea\Projects\DomainChangeService;
use PanelAlpha\ClientArea\Projects\GitCheckoutService;
use PanelAlpha\ClientArea\Projects\GitDeployKeyService;
use PanelAlpha\ClientArea\Projects\OnboardingDeployService;
use PanelAlpha\ClientArea\Projects\OnboardingSshDeployService;
use PanelAlpha\ClientArea\Projects\ReportingService;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Onboarding, domain change, deploy history and reporting paths the route
 * tests do not reach: a deploy that is already starting, the server contract
 * for an archive deploy, refused domain names and rows the Engine
 * sends without an id.
 */
class ProjectFlowServicesGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const STARTING = 'A deploy is already starting for this project. Try again in a moment.';

    protected function setUp(): void
    {
        parent::setUp();
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
    }

    private function application(User $user, array $details = ['template' => 'dind']): Application
    {
        return $this->syncedApplication($user, 'site1', ['details' => $details]);
    }

    private function holdDeployLock(Application $application): void
    {
        $this->assertTrue(Cache::lock(OnboardingDeployService::deployLockKey($application->id), 60)->get());
    }

    // ---- deploy locks ---------------------------------------------------

    public function test_a_git_deploy_onto_a_project_whose_deploy_is_starting_is_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->holdDeployLock($application);

        try {
            app(OnboardingDeployService::class)->deployFromGit($user, [
                'repo_url' => 'https://github.com/acme/site',
                'domain_id' => $application->id,
            ]);
            $this->fail('A second deploy must wait.');
        } catch (ValidationException $e) {
            $this->assertSame([self::STARTING], $e->errors()['domain_id']);
        }
    }

    public function test_a_git_deploy_with_an_unparsable_repository_is_refused(): void
    {
        $user = User::factory()->create();

        try {
            app(OnboardingDeployService::class)->deployFromGit($user, ['repo_url' => 'ftp://example.org/site.git']);
            $this->fail('An unparsable repository must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame(['Invalid repository URL.'], $e->errors()['repo_url']);
        }
    }

    public function test_the_first_deploy_of_a_connected_checkout_is_refused_while_a_deploy_is_starting(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user, ['template' => 'dind', 'git_repo' => 'https://github.com/acme/site']);
        $this->holdDeployLock($application);

        try {
            app(GitCheckoutService::class)->deploy($application, []);
            $this->fail('A second deploy must wait.');
        } catch (ValidationException $e) {
            $this->assertSame([self::STARTING], $e->errors()['branch']);
        }
    }

    public function test_a_deploy_key_request_is_refused_while_a_deploy_is_starting(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->holdDeployLock($application);

        try {
            app(OnboardingSshDeployService::class)->create($user, [
                'repo_url' => 'git@github.com:acme/site.git',
                'domain_id' => $application->id,
            ]);
            $this->fail('A second deploy must wait.');
        } catch (ValidationException $e) {
            $this->assertSame([self::STARTING], $e->errors()['domain_id']);
        }
    }

    // ---- The archive a files deploy takes --------------------------------

    /**
     * @return array<string, array{mixed}>
     */
    public static function notOneArchiveProvider(): array
    {
        return [
            'a string instead of a list' => ['project/.panelalpha-upload/site.zip'],
            'no archive' => [[]],
            'an empty name' => [['']],
            'two archives' => [['project/.panelalpha-upload/a.zip', 'project/.panelalpha-upload/b.zip']],
        ];
    }

    /**
     * The form offers up to five files, a folder and a .sql dump; the server
     * deploys exactly one uploaded archive (`OnboardingDeployService.php:362`).
     */
    #[DataProvider('notOneArchiveProvider')]
    public function test_a_files_deploy_takes_exactly_one_uploaded_archive(mixed $paths): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['onboarding_files_at' => now()])->save();

        try {
            app(OnboardingDeployService::class)->deployFromFiles($user, ['domain_id' => $application->id, 'remote_filepath' => $paths]);
            $this->fail('A files deploy needs exactly one archive.');
        } catch (ValidationException $e) {
            $this->assertSame(['Exactly one uploaded archive is required to deploy from files.'], $e->errors()['remote_filepath']);
        }

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), 'deploy'));
    }

    // ---- GitDeployKeyService --------------------------------------------

    public function test_a_deploy_key_refusal_that_is_not_about_the_host_is_rethrown(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/GitController.php:456 -> GitController::deployKey (422 without a host code)
        Http::fake(['engine.example.com/api/projects/site1/git/deploy-key*' => Http::response([
            'message' => 'The project is not ready.',
            'errors' => ['project' => ['The project is not ready.']],
            'problems' => [['code' => 'project_not_ready']],
        ], 422)]);

        $this->expectException(EngineValidationException::class);

        app(GitDeployKeyService::class)->show($application, 'git@github.com:acme/site.git');
    }

    public function test_a_deploy_key_for_an_address_the_panel_cannot_parse_is_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        try {
            app(GitDeployKeyService::class)->show($application, 'ssh:///nothing');
            $this->fail('An unparsable address must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame(['Invalid repository URL.'], $e->errors()['repo_url']);
        }
    }

    // ---- DomainChangeService --------------------------------------------

    public function test_a_blocked_domain_name_is_not_available(): void
    {
        config(['client-area.subdomains_blacklist' => ['admin*']]);
        $application = $this->application(User::factory()->create());

        try {
            app(DomainChangeService::class)->changeToDomain($application, 'admin.example.org');
            $this->fail('A blocked name must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame(['Domain name is not available.'], $e->errors()['domain']);
        }
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function refusedSubdomainProvider(): array
    {
        return [
            'a blocked name' => ['admin-panel', 'Domain name is not available.'],
            'a name that is not a hostname' => ['bad_name', 'Invalid domain name.'],
        ];
    }

    #[DataProvider('refusedSubdomainProvider')]
    public function test_a_refused_subdomain_names_its_reason(string $subdomain, string $message): void
    {
        config(['client-area.subdomains_blacklist' => ['admin*']]);
        $application = $this->application(User::factory()->create());

        // Engine: core/app/Http/Controllers/SystemController.php:47 -> info
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => ['cert_domain' => 'sites.example.net']])]);

        try {
            app(DomainChangeService::class)->changeToSubdomain($application, $subdomain, 'sites.example.net');
            $this->fail('A refused subdomain must raise a validation error.');
        } catch (ValidationException $e) {
            $this->assertSame([$message], $e->errors()['subdomain']);
        }
    }

    // ---- DeployHistoryService -------------------------------------------

    public function test_the_deploy_history_skips_an_engine_row_without_an_id(): void
    {
        $application = $this->application(User::factory()->create());

        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> index
        Http::fake(['engine.example.com/api/projects/site1/deploys' => Http::response(['data' => [
            $this->engineDeploy(['id' => '']),
            $this->engineDeploy(['id' => '20261014-101500-a1b2c3']),
        ]])]);

        $entries = app(DeployHistoryService::class)->history($application);

        $this->assertCount(1, $entries);
        $this->assertSame('20261014-101500-a1b2c3', $entries[0]->id);
    }

    public function test_an_engine_deploy_log_without_an_id_is_a_404(): void
    {
        $application = $this->application(User::factory()->create());

        // Engine: core/app/Http/Controllers/User/DeployHistoryController.php:39-42 -> show (a log body without an id)
        Http::fake(['engine.example.com/api/projects/site1/deploys/*/log*' => Http::response(['data' => ['lines' => []]])]);

        try {
            app(DeployHistoryService::class)->find($application, '20261014-101500-a1b2c3');
            $this->fail('A log without an id is not a deploy.');
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }
    }

    // ---- ReportingService -----------------------------------------------

    public function test_bandwidth_reads_a_body_wrapped_in_data(): void
    {
        $this->travelTo(Carbon::parse('2026-10-15 12:00:00'));
        $application = $this->application(User::factory()->create());

        // Defensive (not an Engine shape): Engine sends the bare series (core/app/Http/Controllers/User/UsageController.php:64), the panel also accepts a `data` wrapper
        Http::fake(['engine.example.com/api/projects/site1/bandwidth*' => Http::response(['data' => ['2026-10-14' => 4096]])]);

        $report = app(ReportingService::class)->bandwidth($application, 'last-month');

        $this->assertSame(4096, $report['total']);
        $this->assertCount(30, $report['records']);
    }

    public function test_a_visitor_breakdown_reads_a_body_wrapped_in_data(): void
    {
        $application = $this->application(User::factory()->create());

        // Defensive (not an Engine shape): Engine sends the bare list (core/app/Http/Controllers/User/UsageController.php:186), the panel also accepts a `data` wrapper
        Http::fake(['engine.example.com/api/projects/site1/domains/*/visitors/*' => Http::response(['data' => ['Chrome' => 12]])]);

        $this->assertSame(['Chrome' => 12], app(ReportingService::class)->breakdown($application, 'visits-by-device-browser', 'last-month'));
    }
}
