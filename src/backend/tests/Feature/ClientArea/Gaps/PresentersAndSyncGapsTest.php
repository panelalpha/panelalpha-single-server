<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Http\Presenters\SslCertificatePresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectSourceDetails;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionMethod;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Presenter and mirror branches the route tests do not reach: older certificate
 * answers, database labels of the source card and Engine projects without a
 * username.
 */
class PresentersAndSyncGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    // ---- SslCertificatePresenter ------------------------------------------

    /**
     * An Engine `ssl-check` with one public certificate.
     *
     * @param  array<string, mixed>  $certificate
     * @return array<string, mixed>
     */
    private function check(array $certificate): array
    {
        // Engine: core/app/Http/Controllers/User/DomainController.php:145 -> sslCheck
        return ['public' => ['certificate' => $certificate + ['status' => 'valid']], 'dns' => [], 'engine' => []];
    }

    public function test_a_served_certificate_without_an_issuer_has_an_empty_one(): void
    {
        $presented = app(SslCertificatePresenter::class)->presentServed($this->check(['common_name' => 'site1.example.com']));

        $this->assertSame('', $presented['issuer_name']);
    }

    public function test_an_older_certificate_answer_without_the_two_booleans_is_judged_by_its_names(): void
    {
        $presenter = app(SslCertificatePresenter::class);

        $selfSigned = $presenter->presentInstalled([
            'common_name' => 'site1.example.com',
            'issuer_common_name' => 'site1.example.com',
            'domains' => ['site1.example.com'],
        ]);
        $other = $presenter->presentInstalled([
            'common_name' => 'site1.example.com',
            'issuer_common_name' => 'Example CA',
            'domains' => ['other.example.com'],
        ]);

        $this->assertTrue($selfSigned['self_signed']);
        $this->assertTrue($selfSigned['name_match']);
        $this->assertFalse($other['self_signed']);
        $this->assertFalse($other['name_match']);
    }

    // ---- ProjectSourceDetails ---------------------------------------------

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function databaseLabelProvider(): array
    {
        return [
            'mysql image' => ['db', 'mysql:8.4', 'MySQL 8.4'],
            'postgres image' => ['store', 'postgres:16', 'PostgreSQL 16'],
            'postgresql image' => ['store', 'postgresql:15', 'PostgreSQL 15'],
            'mariadb image' => ['db', 'mariadb:11', 'MariaDB 11'],
            'a service named db with another image' => ['db', 'acme/customdb:1', 'Customdb 1'],
        ];
    }

    #[DataProvider('databaseLabelProvider')]
    public function test_the_source_card_names_the_database_engine(string $service, string $image, string $label): void
    {
        $method = new ReflectionMethod(ProjectSourceDetails::class, 'database');

        $database = $method->invoke(app(ProjectSourceDetails::class), [['name' => $service, 'image' => $image]]);

        $this->assertTrue($database['present']);
        $this->assertSame($label, $database['label']);
    }

    // ---- ApplicationSynchronizer ------------------------------------------

    public function test_a_project_without_a_username_is_not_mirrored(): void
    {
        $this->assertNull(app(ApplicationSynchronizer::class)->mirror(1, ['id' => 5, 'domain' => 'x.example.com']));
        $this->assertSame(0, Application::query()->count());
    }

    public function test_a_sync_skips_an_engine_row_without_a_username(): void
    {
        $this->configureEngine();

        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll (one row without a username)
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1'),
            $this->engineProject(11, ''),
        ]])]);

        $this->actingAs(User::factory()->create());
        app(ApplicationSynchronizer::class)->sync(1);

        $this->assertSame(['site1'], Application::query()->pluck('engine_username')->all());
    }
}
