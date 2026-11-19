<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Http\Presenters\WordPress\ImportDetailsPresenter;
use PanelAlpha\ClientArea\Jobs\WordPress\StartWordPressImportJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressImport;
use PanelAlpha\ClientArea\Projects\ImportPluginTokens;
use PanelAlpha\ClientArea\Projects\WordPressImportService;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * WordPressImportService paths `Import/WordPressImportTest` does not reach:
 * a detected site, a start without a downloaded plugin, a cancel or retry the
 * Engine refuses, the clean-up on delete, the manual-method failures and the
 * session token store.
 */
class WordPressImportServiceGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const SITE = 'https://www.blog.example.org';

    private const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

    private function service(): WordPressImportService
    {
        return app(WordPressImportService::class);
    }

    private function tokens(): ImportPluginTokens
    {
        return new ImportPluginTokens(app('session.store'));
    }

    /**
     * @param  array<string, mixed>  $import
     */
    private function importedApplication(array $import = []): Application
    {
        $application = $this->syncedApplication(User::factory()->create(), 'blogexampl', ['domain' => 'blog.example.org']);
        WordPressImport::query()->create($import + [
            'application_id' => $application->id,
            'engine_migration_id' => 7,
            'method' => WordPressImport::METHOD_WP_ADMIN,
            'source_url' => self::SITE,
            'status' => 'running',
            'engine_status' => ['status' => 'running'],
        ]);

        return $application->fresh();
    }

    public function test_the_url_test_reports_a_site_the_engine_found(): void
    {
        $this->configureEngine();

        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:190 -> test (`{ok: true, url, ...}`)
        Http::fake(['engine.example.com/api/wordpress/migrations/test' => Http::response(['ok' => true, 'url' => self::SITE])]);

        $this->assertSame(
            ['wordpress_detected' => true, 'error_message' => null],
            $this->service()->testUrl(self::SITE, null),
        );
    }

    public function test_the_import_start_without_a_downloaded_plugin_says_the_plugin_is_missing(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'blogexampl', ['domain' => 'blog.example.org']);

        try {
            $this->service()->start($user, [
                'domain_id' => $application->id,
                'url' => self::SITE,
                'using_admin_login_credentials' => false,
            ], $this->tokens());
            $this->fail('A manual import needs a plugin token.');
        } catch (ValidationException $e) {
            $this->assertSame([WordPressImportService::PLUGIN_NOT_FOUND], $e->errors()[0]);
        }

        Queue::assertNothingPushed();
    }

    public function test_cancel_answers_false_when_the_engine_refuses(): void
    {
        $application = $this->importedApplication();

        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:401 -> cancel (Engine 5xx)
        Http::fake(['engine.example.com/api/wordpress/migrations/7/cancel' => Http::response(['message' => 'boom'], 500)]);

        $this->assertFalse($this->service()->cancel($application));
        $this->assertSame('running', $application->wordpressImport()->firstOrFail()->status);
    }

    public function test_retry_of_an_import_the_engine_never_got_and_that_did_not_fail_is_refused(): void
    {
        Queue::fake();
        $application = $this->importedApplication(['engine_migration_id' => null, 'status' => WordPressImport::STARTING, 'engine_status' => null]);

        $this->assertFalse($this->service()->retry($application));
        Queue::assertNotPushed(StartWordPressImportJob::class);
    }

    public function test_retry_answers_false_when_the_engine_is_busy_with_the_import(): void
    {
        $application = $this->importedApplication(['status' => WordPressImport::FAILED]);

        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:360 -> resume (409 busy)
        Http::fake(['engine.example.com/api/wordpress/migrations/7/resume' => Http::response(['message' => 'busy'], 409)]);

        $this->assertFalse($this->service()->retry($application));
    }

    public function test_retry_rethrows_an_engine_failure_that_is_not_a_conflict(): void
    {
        $application = $this->importedApplication(['status' => WordPressImport::FAILED]);

        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:360 -> resume (Engine 5xx)
        Http::fake(['engine.example.com/api/wordpress/migrations/7/resume' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        $this->service()->retry($application);
    }

    public function test_forget_goes_on_when_the_engine_refuses_the_cancel(): void
    {
        $application = $this->importedApplication();

        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:401 -> cancel (Engine 5xx)
        Http::fake(['engine.example.com/api/wordpress/migrations/7/cancel' => Http::response(['message' => 'boom'], 500)]);

        $this->service()->forget($application);

        Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/wordpress/migrations/7/cancel'));
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function manualFailureProvider(): array
    {
        return [
            'plugin missing on the source' => [['ok' => false, 'error_type' => 'plugin_not_found', 'message' => 'x'], WordPressImportService::PLUGIN_NOT_FOUND],
            'plugin from another download' => [['ok' => false, 'error_type' => 'unauthorized', 'message' => 'x'], WordPressImportService::PLUGIN_FROM_ANOTHER_DOWNLOAD],
            'any other answer keeps the Engine text' => [['ok' => false, 'error_type' => 'unreachable', 'message' => 'Could not connect to the source.'], 'Could not connect to the source.'],
        ];
    }

    /**
     * @param  array<string, mixed>  $answer
     */
    #[DataProvider('manualFailureProvider')]
    public function test_a_manual_method_failure_is_told_in_the_panels_words(array $answer, string $message): void
    {
        $this->configureEngine();
        $tokens = $this->tokens();
        $tokens->remember(self::TOKEN);

        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:190 -> test
        Http::fake(['engine.example.com/api/wordpress/migrations/test' => Http::response($answer)]);

        $result = $this->service()->testConnection([
            'url' => self::SITE,
            'using_admin_login_credentials' => false,
        ], $tokens);

        $this->assertFalse($result['success']);
        $this->assertSame('error', $result['error_type']);
        $this->assertSame($message, $result['message']);
    }

    public function test_the_session_gives_the_newest_token_for_a_url_it_did_not_verify(): void
    {
        $tokens = $this->tokens();
        $tokens->remember(self::TOKEN);
        $tokens->verify('https://other.example.org', str_repeat('f', 64));

        $this->assertSame(self::TOKEN, $tokens->forUrl(self::SITE));
    }

    public function test_the_session_has_no_token_before_a_plugin_was_downloaded(): void
    {
        $this->assertNull($this->tokens()->forUrl(self::SITE));
    }

    public function test_import_details_skip_an_engine_step_without_a_name(): void
    {
        $application = $this->importedApplication(['engine_status' => [
            'status' => 'running',
            'steps' => [['status' => 'completed'], ['name' => 'create_project', 'status' => 'completed']],
        ]]);

        $details = app(ImportDetailsPresenter::class)->present($application->wordpressImport()->firstOrFail());

        $this->assertCount(1, $details['steps']);
    }
}
