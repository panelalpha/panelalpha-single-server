<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\ServerAccountService;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * ServerAccountService branches the hosting route tests do not reach: a
 * database rename the Engine does not queue, task failures, a database name
 * the WordPress config does not hold, cron services, an SFTP name that is too
 * long, SSL reads that fail and a PHP directive value with a line break.
 */
class ServerAccountServiceGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function service(): ServerAccountService
    {
        return app(ServerAccountService::class);
    }

    private function application(string $type = Application::TYPE_CUSTOM, array $details = []): Application
    {
        $application = $this->syncedApplication(User::factory()->create(), 'site1', ['details' => $details]);
        $application->forceFill(['type' => $type])->save();

        return $application->fresh();
    }

    public function test_a_database_rename_without_a_task_is_not_proven(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:252 -> rename, a 202 without a task
        Http::fake(['engine.example.com/api/projects/site1/mysql/databases/site1_wp/rename' => Http::response(['data' => []], 202)]);

        try {
            $this->service()->renameDatabase($application, 'site1_wp', 'blog');
            $this->fail('A rename without a task cannot be followed.');
        } catch (EngineRequestException $e) {
            $this->assertSame(200, $e->engineStatus);
        }
    }

    public function test_a_failed_rename_task_tells_the_first_problem_message(): void
    {
        Sleep::fake();
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:252 -> rename, 202 TaskResource
        // Engine: core/app/Http/Controllers/TaskController.php:207 -> show (a failed task with details.problems[])
        Http::fake([
            'engine.example.com/api/projects/site1/mysql/databases/site1_wp/rename' => Http::response(['data' => ['id' => 60, 'status' => 'queued']], 202),
            'engine.example.com/api/tasks/60*' => Http::response(['data' => [
                'id' => 60,
                'status' => 'failed',
                'details' => ['problems' => [['message' => ''], ['message' => 'The name is reserved.']]],
            ]]),
        ]);

        try {
            $this->service()->renameDatabase($application, 'site1_wp', 'blog');
            $this->fail('A failed task must refuse the rename.');
        } catch (ValidationException $e) {
            $this->assertSame(['The name is reserved.'], $e->errors()[0]);
        }
    }

    public function test_a_wordpress_rename_leaves_the_config_alone_when_it_holds_no_database_name(): void
    {
        $application = $this->application(Application::TYPE_WORDPRESS);

        // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67 -> index (no DB_NAME row)
        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:252 -> rename, 202 TaskResource with details from/to
        // Engine: core/app/Http/Controllers/TaskController.php:207 -> show
        Http::fake([
            'engine.example.com/api/projects/site1/wp/config?*' => Http::response(['data' => [['name' => 'DB_USER', 'value' => 'site1_wp', 'type' => 'constant']]]),
            'engine.example.com/api/projects/site1/mysql/databases/site1_wp/rename' => Http::response(['data' => [
                'id' => 61, 'status' => 'queued', 'details' => ['from' => 'site1_wp', 'to' => 'site1_blog'],
            ]], 202),
            'engine.example.com/api/tasks/61*' => Http::response(['data' => ['id' => 61, 'status' => 'completed']]),
        ]);

        $this->service()->renameDatabase($application, 'site1_wp', 'blog');

        Http::assertNotSent(fn ($request): bool => $request->method() === 'PUT' && str_contains($request->url(), '/wp/config/'));
    }

    public function test_the_cron_page_lists_no_services_when_the_container_list_fails(): void
    {
        $application = $this->application(Application::TYPE_CUSTOM, ['template' => 'dind']);

        // Engine: core/app/Http/Controllers/User/CronJobController.php:34 -> cron-jobs index
        // Engine: core/app/Http/Controllers/User/ContainerController.php:82 -> index (Engine 5xx)
        Http::fake([
            'engine.example.com/api/projects/site1/cron-jobs' => Http::response(['data' => []]),
            'engine.example.com/api/projects/site1/containers' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->assertSame([], $this->service()->cronJobs($application)['meta']['services']);
    }

    public function test_an_sftp_name_that_is_too_long_with_the_project_prefix_is_refused(): void
    {
        $application = $this->application();

        try {
            $this->service()->createSftpAccount($application, [
                'username' => str_repeat('a', 30),
                'type' => 'password',
                'password' => 'Str0ng!Passw0rd',
            ]);
            $this->fail('A name over the Engine limit must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame(['The username is too long for this project.'], $e->errors()['username']);
        }

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), 'sftp-accounts'));
    }

    public function test_an_ssl_check_failure_that_is_not_a_404_is_rethrown(): void
    {
        $application = $this->application();
        Cache::flush();

        // Engine: core/app/Http/Controllers/User/DomainController.php:145 -> sslCheck (Engine 5xx)
        Http::fake(['engine.example.com/api/projects/site1/domains/site1.example.com/ssl-check' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        $this->service()->servedCertificate($application, 'site1.example.com');
    }

    public function test_an_installed_certificate_read_that_is_not_a_404_is_rethrown(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/DomainController.php:113 -> installedSslCert (Engine 5xx)
        Http::fake(['engine.example.com/api/projects/site1/domains/site1.example.com/installed-ssl-cert*' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        $this->service()->engineCertificate($application, 'site1.example.com');
    }

    public function test_a_php_directive_value_with_a_line_break_is_refused(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/DomainController.php:53 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
            ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
        ]])]);

        try {
            $this->service()->setPhpSettings($application, 'site1.example.com', ['memory_limit' => "256M\nauto_prepend_file=x"]);
            $this->fail('A directive value with a line break must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame(['Invalid directive value.'], $e->errors()['settings']);
        }

        Http::assertNotSent(fn ($request): bool => $request->method() === 'PUT');
    }
}
