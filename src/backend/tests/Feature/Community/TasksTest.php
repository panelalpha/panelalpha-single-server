<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The Engine task list (`/api/community/tasks`).
 */
class TasksTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    private function signedIn(): static
    {
        $this->configureEngine();

        return $this->actingAs(User::factory()->create());
    }

    private function project(int $id, string $username, ?string $name): Application
    {
        return Application::query()->create([
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_project_id' => $id,
            'engine_username' => $username,
            'name' => $name,
            'domain' => $username.'.example.com',
            'status' => 'active',
            'type' => 'wordpress',
        ]);
    }

    /**
     * One item of the Engine's task list (`TaskSummaryResource`).
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function engineTask(int $id, array $overrides = []): array
    {
        return array_merge([
            'id' => $id,
            'job_id' => null,
            'queue' => 'default',
            'job_type' => 'App\\Jobs\\DeployProject',
            'status' => 'completed',
            'details' => ['action' => 'deploy'],
            'username' => 'u10',
            'pid' => null,
            'pid_start_time' => null,
            'queued_at' => '2026-10-15T10:00:00.000000Z',
            'started_at' => '2026-10-15T10:00:05.000000Z',
            'completed_at' => '2026-10-15T10:01:00.000000Z',
            'failed_at' => null,
            'cancelled_at' => null,
            'action' => 'deploy',
            'created_by_token_id' => 1,
        ], $overrides);
    }

    /**
     * @param  list<array<string, mixed>>  $tasks
     * @param  array<string, int>  $meta
     */
    private function fakeEngine(array $tasks, array $meta = []): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:91 -> index, core/app/Http/Resources/TaskSummaryResource.php:14-25 items in a paginated `{data, links, meta}`
            'engine.example.com/api/tasks*' => Http::response([
                'data' => $tasks,
                'links' => [],
                'meta' => array_merge(['current_page' => 1, 'last_page' => 1, 'per_page' => 50, 'total' => count($tasks)], $meta),
            ]),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function engineQuery(): array
    {
        $query = [];
        Http::assertSent(function (Request $request) use (&$query): bool {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return str_contains($request->url(), '/api/tasks');
        });

        return $query;
    }

    public function test_rows_are_linked_to_projects_by_engine_username(): void
    {
        $this->project(10, 'u10', 'Shop');
        $this->project(11, 'u11', null);
        $this->fakeEngine([
            $this->engineTask(3, ['username' => 'u10']),
            $this->engineTask(2, ['username' => 'u11']),
            $this->engineTask(1, ['username' => 'ghost']),
            $this->engineTask(0, ['username' => null, 'job_type' => 'App\\Jobs\\DeleteBackupContainer', 'action' => 'delete_container']),
        ], ['last_page' => 4, 'total' => 190]);

        // CA: packages/client-area/src/apis/FreePanel.js:14
        $response = $this->signedIn()->getJson('/api/community/tasks')->assertOk();

        $response
            // CA reads: packages/client-area/src/views/free/TasksTableCell.vue:6 (project, username), TaskProjectCell.vue:15 (id), :17 (name), :19 (domain)
            ->assertJsonPath('data.0.project', ['id' => Application::query()->where('engine_username', 'u10')->value('id'), 'name' => 'Shop', 'domain' => 'u10.example.com'])
            ->assertJsonPath('data.0.username', 'u10')
            // The name falls back to the Engine username.
            ->assertJsonPath('data.1.project.name', 'u11')
            ->assertJsonPath('data.1.project.domain', 'u11.example.com')
            // CA reads: packages/client-area/src/views/free/TaskProjectCell.vue:51 (an unknown or null username has no project)
            ->assertJsonPath('data.2.project', null)
            ->assertJsonPath('data.2.username', 'ghost')
            ->assertJsonPath('data.3.project', null)
            ->assertJsonPath('data.3.username', null)
            // CA reads: packages/client-area/src/views/free/Tasks.vue:275 (data), :276 (meta.total), :277 (meta.last_page)
            ->assertJsonPath('meta', ['current_page' => 1, 'last_page' => 4, 'per_page' => 50, 'total' => 190]);

        $this->assertSame(
            ['id', 'action', 'job_type', 'status', 'username', 'project', 'error', 'queued_at', 'started_at', 'finished_at'],
            array_keys($response->json('data.0')),
        );
        // CA reads: packages/client-area/src/views/free/TasksTableCell.vue:73 (action), :76 (job_type)
        $this->assertSame('deploy', $response->json('data.0.action'));
        $this->assertSame('App\\Jobs\\DeleteBackupContainer', $response->json('data.3.job_type'));
    }

    public function test_a_staging_copy_without_a_name_shows_the_staging_name_of_its_parent(): void
    {
        $parent = $this->project(10, 'twp1', 'twp1');
        $this->project(11, 'twp18669', null)->forceFill(['staging_of_id' => $parent->id])->save();
        $this->project(12, 'plain', null);
        $this->fakeEngine([
            $this->engineTask(3, ['username' => 'twp18669']),
            $this->engineTask(2, ['username' => 'twp1']),
            $this->engineTask(1, ['username' => 'plain']),
        ]);

        // CA: packages/client-area/src/apis/FreePanel.js:14
        $this->signedIn()->getJson('/api/community/tasks')
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/TaskProjectCell.vue:17 (name)
            ->assertJsonPath('data.0.project.name', '(staging) twp1')
            ->assertJsonPath('data.1.project.name', 'twp1')
            ->assertJsonPath('data.2.project.name', 'plain');
    }

    public function test_a_project_without_a_domain_has_a_null_domain(): void
    {
        $this->project(10, 'u10', 'Shop')->forceFill(['domain' => null])->save();
        $this->fakeEngine([$this->engineTask(1, ['username' => 'u10'])]);

        // CA: packages/client-area/src/apis/FreePanel.js:14
        $this->signedIn()->getJson('/api/community/tasks')
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/TaskProjectCell.vue:19 (domain is optional)
            ->assertJsonPath('data.0.project.domain', null);
    }

    public function test_the_error_of_a_failed_task_is_sanitised(): void
    {
        $this->fakeEngine([
            $this->engineTask(4, ['status' => 'failed', 'completed_at' => null, 'failed_at' => '2026-10-15T10:02:00.000000Z', 'details' => ['action' => 'deploy', 'error' => 'Build failed, see GET /api/tasks/48 for details']]),
            $this->engineTask(3, ['status' => 'failed', 'completed_at' => null, 'failed_at' => '2026-10-15T10:02:00.000000Z', 'details' => ['action' => 'deploy', 'error' => 'Build failed']]),
            $this->engineTask(2, ['status' => 'failed', 'completed_at' => null, 'failed_at' => '2026-10-15T10:02:00.000000Z', 'details' => ['action' => 'deploy', 'error' => '']]),
            $this->engineTask(1, ['status' => 'completed', 'details' => ['action' => 'deploy', 'error' => 'stale text']]),
        ]);
        Log::spy();

        // CA: packages/client-area/src/apis/FreePanel.js:14
        $response = $this->signedIn()->getJson('/api/community/tasks')->assertOk();

        // The list is polled, so a redacted error is not logged on every read.
        Log::shouldNotHaveReceived('warning');
        // CA reads: packages/client-area/src/views/free/TasksTableCell.vue:41 (status, error)
        $this->assertStringNotContainsString('/api/tasks', (string) $response->json('data.0.error'));
        $this->assertStringContainsString('Build failed', (string) $response->json('data.0.error'));
        $this->assertSame('Build failed', $response->json('data.1.error'));
        $this->assertNull($response->json('data.2.error'));
        $this->assertNull($response->json('data.3.error'));
    }

    public function test_finished_at_falls_back_through_failed_at_and_cancelled_at(): void
    {
        $this->fakeEngine([
            $this->engineTask(3, ['completed_at' => '2026-10-15T10:01:00.000000Z', 'failed_at' => null, 'cancelled_at' => null]),
            $this->engineTask(2, ['status' => 'failed', 'completed_at' => null, 'failed_at' => '2026-10-15T10:02:00.000000Z']),
            $this->engineTask(1, ['status' => 'cancelled', 'completed_at' => null, 'cancelled_at' => '2026-10-15T10:03:00.000000Z']),
            $this->engineTask(0, ['status' => 'running', 'completed_at' => null, 'started_at' => null]),
        ]);

        // CA: packages/client-area/src/apis/FreePanel.js:14
        $this->signedIn()->getJson('/api/community/tasks')
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/TasksTableCell.vue:93 (status, started_at, queued_at, finished_at)
            ->assertJsonPath('data.0.finished_at', '2026-10-15T10:01:00.000000Z')
            ->assertJsonPath('data.1.finished_at', '2026-10-15T10:02:00.000000Z')
            ->assertJsonPath('data.2.finished_at', '2026-10-15T10:03:00.000000Z')
            ->assertJsonPath('data.3.finished_at', null)
            ->assertJsonPath('data.3.status', 'running')
            ->assertJsonPath('data.3.started_at', null)
            ->assertJsonPath('data.0.queued_at', '2026-10-15T10:00:00.000000Z');
    }

    public function test_the_filters_and_the_all_scope_reach_the_engine(): void
    {
        $this->fakeEngine([]);

        // CA: packages/client-area/src/apis/FreePanel.js:14
        $this->signedIn()->getJson('/api/community/tasks?page=2&per_page=100&status=failed&action=git_pull')
            ->assertOk()
            // CA reads: packages/client-area/src/views/free/Tasks.vue:273 (the params built at :257-259)
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonPath('meta.per_page', 100);

        $this->assertEquals(
            ['page' => '2', 'per_page' => '100', 'status' => 'failed', 'action' => 'git_pull', 'scope' => 'all'],
            $this->engineQuery(),
        );
    }

    public function test_only_the_present_filters_are_sent_and_per_page_defaults_to_50(): void
    {
        $this->fakeEngine([]);

        // CA: packages/client-area/src/apis/FreePanel.js:14
        // CA reads: packages/client-area/src/views/free/Tasks.vue:276 (meta.total beside the paging in meta)
        $this->signedIn()->getJson('/api/community/tasks')->assertOk()->assertJsonPath('meta.per_page', 50);

        $this->assertEquals(['per_page' => '50', 'scope' => 'all'], $this->engineQuery());
    }

    /**
     * @return array<string, array{string}>
     */
    public static function invalidQueries(): array
    {
        return [
            'unknown status' => ['status=bogus'],
            'per_page off the list' => ['per_page=500'],
            'page zero' => ['page=0'],
            'action with a slash' => ['action=a/b'],
            'over-long action' => ['action='.str_repeat('a', 65)],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('invalidQueries')]
    public function test_an_invalid_query_is_a_422_without_an_engine_call(string $query): void
    {
        $this->fakeEngine([]);

        // CA: packages/client-area/src/apis/FreePanel.js:14
        $this->signedIn()->getJson('/api/community/tasks?'.$query)->assertStatus(422);

        Http::assertNothingSent();
    }

    public function test_an_engine_failure_renders_through_engine_errors(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/TaskController.php:91 -> index, core/app/Http/Resources/TaskSummaryResource.php:14-25 items in a paginated `{data, links, meta}`
            'engine.example.com/api/tasks*' => Http::response(['message' => 'Server error'], 500),
        ]);

        // CA: packages/client-area/src/apis/FreePanel.js:14
        $this->signedIn()->getJson('/api/community/tasks')
            ->assertStatus(502)
            // CA reads: packages/client-area/src/views/free/Tasks.vue:286 (Api.getErrorMessage reads `message`)
            ->assertJsonStructure(['message']);
    }

    public function test_a_guest_gets_401(): void
    {
        // CA: packages/client-area/src/apis/FreePanel.js:14
        $this->getJson('/api/community/tasks')->assertUnauthorized();
    }

    public function test_the_route_is_a_404_outside_single_user_mode(): void
    {
        $this->bindMultiUserEdition([]);
        $this->fakeEngine([]);
        $client = $this->signedIn();

        // CA: packages/client-area/src/apis/FreePanel.js:14
        $client->getJson('/api/community/tasks')->assertNotFound();
        // The gate answers before validation: an invalid query is still a 404.
        $client->getJson('/api/community/tasks?status=bogus')->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_the_route_is_throttled_at_120_a_minute(): void
    {
        $this->fakeEngine([]);
        $client = $this->signedIn();
        for ($i = 0; $i < 120; $i++) {
            // CA: packages/client-area/src/apis/FreePanel.js:14
            $client->getJson('/api/community/tasks')->assertOk();
        }

        // CA: packages/client-area/src/apis/FreePanel.js:14
        $client->getJson('/api/community/tasks')->assertStatus(429);
    }
}
