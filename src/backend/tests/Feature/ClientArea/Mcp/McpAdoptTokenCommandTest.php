<?php

namespace Tests\Feature\ClientArea\Mcp;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\McpToken;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Engine MCP tokens minted before the panel recorded their owner are not
 * adopted automatically – an unowned token may be the Engine operator's own
 * server-wide token, and rescoping it would break that assistant. The operator
 * runs `php artisan client-area:mcp-adopt-token {engineTokenId} {--user=}`: it
 * rescopes the token to the user's projects first, then records the ownership,
 * and refuses the panel's own API token (`api-access:`), a token already
 * owned and an unknown id. `--user` defaults to the only user in single-user
 * mode and is required otherwise.
 *
 * Engine: `GET /mcp-tokens` (core/app/Http/Controllers/McpTokenController.php:35,
 * tokens with `name` and `projects`) and `PUT /mcp-tokens/{id}/projects`
 * (core/app/Http/Controllers/McpTokenController.php:130; a project name the
 * Engine no longer has is a 422, core/app/Http/Requests/McpTokenProjectsRequest.php:21;
 * an empty list is accepted since Engine 2.2.0). The panel's own
 * token is named `api-access:<…>`.
 */
final class McpAdoptTokenCommandTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * @param  list<string>|null  $projects
     * @return array<string, mixed>
     */
    private static function token(int $id, string $name, ?array $projects = null): array
    {
        return [
            'id' => $id, 'name' => $name, 'projects' => $projects, 'last_used_at' => null,
            'revoked_at' => null, 'created_at' => '2026-10-01T00:00:00+00:00',
        ];
    }

    private function fakeEngine(int $putStatus = 200): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 → UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => [$this->engineProject(1, 'site1')]]),
            // Engine: core/app/Http/Controllers/McpTokenController.php:35 → index()
            'engine.example.com/api/mcp-tokens' => Http::response(['data' => [
                self::token(7, 'Claude Desktop'),
                self::token(8, 'api-access:panel'),
            ]]),
            'engine.example.com/api/mcp-tokens/7/projects' => $putStatus === 200
                // Engine: core/app/Http/Controllers/McpTokenController.php:130 → updateProjects()
                ? Http::response(['data' => self::token(7, 'Claude Desktop', ['site1'])])
                // Engine: core/app/Http/Requests/McpTokenProjectsRequest.php:21 → `projects.*` exists:users,username
                : Http::response(['message' => 'The selected projects.0 is invalid.', 'errors' => ['projects.0' => ['The selected projects.0 is invalid.']]], 422),
        ]);
    }

    /**
     * @return list<string>
     */
    private function sentPaths(string $method): array
    {
        return Http::recorded(static fn (Request $request): bool => $request->method() === $method)
            ->map(static fn (array $pair): string => (string) parse_url($pair[0]->url(), PHP_URL_PATH))
            ->values()
            ->all();
    }

    public function test_the_only_user_adopts_a_token_in_single_user_mode(): void
    {
        $user = User::factory()->create();
        $this->syncedApplication($user, 'site1');
        $this->fakeEngine();

        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => '7'])
            ->expectsOutputToContain('scoped to site1')
            ->assertExitCode(0);

        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/api/mcp-tokens/7/projects')
            && $request->data() === ['projects' => ['site1']]);
        $this->assertSame(
            [['user_id' => $user->id, 'engine_id' => EngineConnection::DEFAULT_ID, 'engine_token_id' => 7, 'name' => 'Claude Desktop']],
            McpToken::query()->get(['user_id', 'engine_id', 'engine_token_id', 'name'])->toArray(),
        );
    }

    public function test_the_panels_own_api_token_is_refused(): void
    {
        User::factory()->create();
        $this->configureEngine();
        $this->fakeEngine();

        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => '8'])
            ->expectsOutputToContain("the panel's own API token")
            ->assertExitCode(1);

        $this->assertSame([], $this->sentPaths('PUT'));
        $this->assertSame(0, McpToken::query()->count());
    }

    public function test_a_token_already_owned_is_refused_without_an_engine_call(): void
    {
        $this->configureEngine();
        $this->ownedMcpBearer(7);
        $this->fakeEngine();

        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => '7', '--user' => (string) User::query()->value('id')])
            ->expectsOutputToContain('already a Connect AI token')
            ->assertExitCode(1);

        Http::assertNothingSent();
    }

    public function test_an_unknown_token_is_refused(): void
    {
        User::factory()->create();
        $this->configureEngine();
        $this->fakeEngine();

        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => '99'])
            ->expectsOutputToContain('does not exist')
            ->assertExitCode(1);

        $this->assertSame([], $this->sentPaths('PUT'));
        $this->assertSame(0, McpToken::query()->count());
    }

    public function test_a_refused_scope_records_nothing(): void
    {
        // A project deleted on the Engine between the mirror and the PUT.
        User::factory()->create();
        $this->configureEngine();
        $this->fakeEngine(422);

        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => '7'])
            ->expectsOutputToContain('The Engine refused')
            ->assertExitCode(1);

        $this->assertSame(0, McpToken::query()->count());
    }

    public function test_user_is_required_when_single_user_mode_has_several_users(): void
    {
        User::factory()->count(2)->create();
        $this->configureEngine();
        $this->fakeEngine();

        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => '7'])
            ->expectsOutputToContain('--user is required')
            ->assertExitCode(1);

        Http::assertNothingSent();
    }

    public function test_user_is_required_outside_single_user_mode(): void
    {
        $alice = User::factory()->create(['email' => 'alice@example.com']);
        $this->syncedApplication($alice, 'site1');
        $this->bindMultiUserEdition([$alice->id => ['site1']]);
        $this->fakeEngine();

        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => '7'])
            ->expectsOutputToContain('--user is required outside single-user mode')
            ->assertExitCode(1);
        $this->assertSame([], $this->sentPaths('PUT'));

        // With --user (by email) the edition's scope for that user is used.
        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => '7', '--user' => 'alice@example.com'])
            ->assertExitCode(0);
        $this->assertSame(['/api/mcp-tokens/7/projects'], $this->sentPaths('PUT'));
        $this->assertSame($alice->id, McpToken::query()->value('user_id'));
    }
}
