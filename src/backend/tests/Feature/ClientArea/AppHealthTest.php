<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The deploy warnings next to the "Project Details" tab come from the Engine's
 * probe of the running application, not from the project's type: the CA used to
 * show "Missing index file" and "Wrong listen port" on every custom project.
 *
 * Contract:
 * - CA calls: `GET /instances/{id}/app-health` (`packages/client-area/src/apis/Instances.js:27`),
 *   rewritten to `/projects`; CA reads `response.data.data` (`:28`): `available`, `healthy`,
 *   `serving`, `ports[].port|status`, `checks[].id|title|detail|fix`
 *   (`components/instances/statusIssues/collectInstanceIssues.js:91-135`, `deployIssuesFromHealth()`).
 * - Engine: `GET /projects/{u}/app/health?timeout=&attempts=`
 *   (`core/app/Http/Controllers/User/AppHealthController.php:102-125`), 403 for a
 *   project that is not a container project (`:36-38`).
 */
final class AppHealthTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const HEALTH = 'engine.example.com/api/projects/site1/app/health*';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    /**
     * @return array<string, mixed>
     */
    private static function report(): array
    {
        return [
            'healthy' => true,
            'serving' => 'missing_entry',
            'ports' => [
                ['port' => 8080, 'scheme' => 'http', 'status' => 'ok', 'http_code' => 403, 'time' => 0.01, 'detail' => 'HTTP 403'],
            ],
            'domain' => ['verdict' => 'ok'],
            'checks' => [
                ['id' => 'no-server-error', 'group' => '_baseline', 'status' => 'pass', 'severity' => 'error', 'title' => null, 'detail' => null, 'fix' => null, 'evidence' => null],
                ['id' => 'entry-served', 'group' => 'php', 'status' => 'fail', 'severity' => 'error', 'title' => 'The front page is missing: / answered 403.', 'detail' => 'No index.php in /var/www/html.', 'fix' => 'Upload an index.php.', 'evidence' => ['status' => 403]],
                ['id' => 'not-a-dev-server', 'group' => '_baseline', 'status' => 'fail', 'severity' => 'warning', 'title' => 'A development server answers.', 'detail' => null, 'fix' => null, 'evidence' => null],
                ['id' => 'some-note', 'group' => '_baseline', 'status' => 'fail', 'severity' => 'info', 'title' => 'Info only.', 'detail' => null, 'fix' => null, 'evidence' => null],
                ['id' => 'skipped-one', 'group' => 'php', 'status' => 'skipped', 'severity' => 'error', 'title' => null, 'detail' => 'not PHP', 'fix' => null, 'evidence' => null],
            ],
        ];
    }

    public function test_a_container_project_gets_the_engine_verdict_with_only_the_failing_checks(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        // Engine: core/app/Http/Controllers/User/AppHealthController.php:125
        Http::fake([self::HEALTH => Http::response(['data' => self::report()])]);

        // CA: src/apis/Instances.js:27
        // CA reads: src/components/instances/statusIssues/collectInstanceIssues.js:91-135
        $this->actingAs($user)
            ->getJson('/api/projects/'.$application->id.'/app-health')
            ->assertOk()
            ->assertExactJson(['data' => [
                'available' => true,
                'healthy' => true,
                'serving' => 'missing_entry',
                'ports' => [['port' => 8080, 'status' => 'ok', 'http_code' => 403, 'detail' => 'HTTP 403']],
                'checks' => [
                    ['id' => 'entry-served', 'severity' => 'error', 'title' => 'The front page is missing: / answered 403.', 'detail' => 'No index.php in /var/www/html.', 'fix' => 'Upload an index.php.'],
                    ['id' => 'not-a-dev-server', 'severity' => 'warning', 'title' => 'A development server answers.', 'detail' => null, 'fix' => null],
                ],
            ]]);

        // One short probe, not the Engine's default 5 s x 3 attempts per port.
        Http::assertSent(fn (Request $r) => str_contains($r->url(), '/api/projects/site1/app/health')
            && $r->data() === ['timeout' => 3, 'attempts' => 1]);
    }

    public function test_the_answer_is_reused_for_a_minute(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        // Engine: core/app/Http/Controllers/User/AppHealthController.php:125
        Http::fake([self::HEALTH => Http::response(['data' => self::report()])]);

        // CA: src/apis/Instances.js:27
        $this->actingAs($user)->getJson('/api/projects/'.$application->id.'/app-health')->assertOk();
        // CA: src/apis/Instances.js:27
        $this->actingAs($user)->getJson('/api/projects/'.$application->id.'/app-health')->assertOk();
        $this->assertCount(1, Http::recorded(fn (Request $r) => str_contains($r->url(), '/app/health')));

        $this->travel(61)->seconds();
        // CA: src/apis/Instances.js:27
        $this->actingAs($user)->getJson('/api/projects/'.$application->id.'/app-health')->assertOk();
        $this->assertCount(2, Http::recorded(fn (Request $r) => str_contains($r->url(), '/app/health')));
    }

    public function test_a_classic_project_is_not_probed(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1');

        // CA: src/apis/Instances.js:27
        // CA reads: src/components/instances/statusIssues/collectInstanceIssues.js:92
        $this->actingAs($user)
            ->getJson('/api/projects/'.$application->id.'/app-health')
            ->assertOk()
            ->assertExactJson(['data' => ['available' => false]]);

        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/app/health'));
    }

    public function test_a_project_the_engine_does_not_probe_is_not_available(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        // Engine: core/app/Http/Controllers/User/AppHealthController.php:38
        Http::fake([self::HEALTH => Http::response(['message' => 'App health checks work only on container projects (template dind).'], 403)]);

        // CA: src/apis/Instances.js:27
        // CA reads: src/components/instances/statusIssues/collectInstanceIssues.js:92
        $this->actingAs($user)
            ->getJson('/api/projects/'.$application->id.'/app-health')
            ->assertOk()
            ->assertExactJson(['data' => ['available' => false]]);
    }
}
