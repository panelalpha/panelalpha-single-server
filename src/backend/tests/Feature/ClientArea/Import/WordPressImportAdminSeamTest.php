<?php

namespace Tests\Feature\ClientArea\Import;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressImport;
use PanelAlpha\ClientArea\Projects\WordPressImportService;
use PanelAlpha\EngineClient\EngineConnection;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The calls the Admin Area's bulk import makes on the import service: the
 * wp-admin source body, the connection check and the stop.
 */
class WordPressImportAdminSeamTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const SITE = 'https://www.blog.example.org';

    public function test_the_admin_source_is_the_wp_admin_start_body(): void
    {
        $service = app(WordPressImportService::class);

        $this->assertSame([
            'url' => self::SITE,
            'method' => WordPressImport::METHOD_WP_ADMIN,
            'username' => 'admin',
            'password' => 'secret',
        ], $service->adminSource(self::SITE, 'admin', 'secret', 'https://'));

        $this->assertSame([
            'url' => self::SITE,
            'method' => WordPressImport::METHOD_WP_ADMIN,
            'login_url' => self::SITE.'/login',
            'username' => 'admin',
            'password' => 'secret',
        ], $service->adminSource(self::SITE, 'admin', 'secret', self::SITE.'/login'));
    }

    /**
     * @return array<string, array{array<string, mixed>, array{ok: bool, url: ?string, error: ?string}}>
     */
    public static function checkAnswers(): array
    {
        return [
            'a passed check' => [['ok' => true, 'url' => self::SITE], ['ok' => true, 'url' => self::SITE, 'error' => null]],
            'a passed check without a url' => [['ok' => true], ['ok' => true, 'url' => null, 'error' => null]],
            'a blocked login page' => [['ok' => false, 'error_type' => 'cloudflare'], ['ok' => false, 'url' => null, 'error' => WordPressImportService::ADMIN_LOGIN_BLOCKED]],
            'a wrong login' => [['ok' => false, 'error_type' => 'login_failed'], ['ok' => false, 'url' => null, 'error' => WordPressImportService::CANNOT_CONNECT]],
            'a taken domain' => [['ok' => false, 'error_type' => 'domain_taken'], ['ok' => false, 'url' => null, 'error' => WordPressImportService::DOMAIN_TAKEN]],
            'an Engine message' => [['ok' => false, 'error_type' => 'unreachable', 'message' => 'Could not connect to www.blog.example.org.'], ['ok' => false, 'url' => null, 'error' => 'Could not connect to www.blog.example.org.']],
        ];
    }

    /**
     * @param  array<string, mixed>  $answer
     * @param  array{ok: bool, url: ?string, error: ?string}  $expected
     */
    #[DataProvider('checkAnswers')]
    public function test_the_admin_source_check_reads_the_engine_answer(array $answer, array $expected): void
    {
        $this->configureEngine();
        // Engine: core/app/System/Project/PhpHosting/WordPress/Migration/SourceProbe.php:68 -> run (a failed source is a 200 `{ok:false, error_type, message}`)
        Http::fake(['engine.example.com/api/wordpress/migrations/test' => Http::response($answer)]);

        $service = app(WordPressImportService::class);
        $source = $service->adminSource(self::SITE, 'admin', 'secret');
        $source['source_ip'] = TestNetwork::public(10);

        $this->assertSame($expected, $service->checkAdminSource($source));
    }

    public function test_stopping_an_import_needs_an_unfinished_one(): void
    {
        $application = $this->application();
        $service = app(WordPressImportService::class);

        $this->assertFalse($service->cancel($application));

        $this->import($application, ['status' => WordPressImport::FAILED, 'engine_migration_id' => 7]);
        $this->assertFalse($service->cancel($application->refresh()));

        $application->wordpressImport()->delete();
        $this->import($application, ['status' => 'running', 'engine_migration_id' => null]);
        $this->assertFalse($service->cancel($application->refresh()));
    }

    public function test_stopping_an_import_cancels_it_on_the_engine(): void
    {
        $application = $this->application();
        $this->import($application, ['status' => 'running', 'engine_migration_id' => 7]);
        Http::fake([
            // Engine: core/app/Http/Controllers/WordpressMigrationController.php:407 -> cancel (202 toStatusArray)
            'engine.example.com/api/wordpress/migrations/7/cancel' => Http::response(['id' => 7, 'status' => 'cancelling'], 202),
        ]);

        $this->assertTrue(app(WordPressImportService::class)->cancel($application->refresh()));

        $import = $application->wordpressImport()->firstOrFail();
        $this->assertSame('cancelling', $import->status);
        $this->assertSame('cancelling', $import->engine_status['status']);
    }

    public function test_an_engine_that_refuses_the_stop_keeps_the_import(): void
    {
        $application = $this->application();
        $this->import($application, ['status' => 'running', 'engine_migration_id' => 7]);
        Http::fake([
            // Engine: core/app/Http/Controllers/WordpressMigrationController.php:407 -> cancel (202 toStatusArray)
            'engine.example.com/api/wordpress/migrations/7/cancel' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->assertFalse(app(WordPressImportService::class)->cancel($application->refresh()));
        $this->assertSame('running', $application->wordpressImport()->firstOrFail()->status);
    }

    private function application(): Application
    {
        $this->configureEngine();

        return Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_username' => 'blogexampl',
            'domain' => 'blog.example.org',
            'status' => 'active',
            'type' => Application::TYPE_WORDPRESS,
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function import(Application $application, array $attributes): WordPressImport
    {
        return WordPressImport::query()->create($attributes + [
            'application_id' => $application->id,
            'method' => WordPressImport::METHOD_WP_ADMIN,
            'source_url' => self::SITE,
        ]);
    }
}
