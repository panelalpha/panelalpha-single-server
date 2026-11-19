<?php

namespace Tests\Feature\EngineClient;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Api\McpApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Engine-client's `McpApi` mints project-scoped MCP tokens and
 * replaces a token's scope (since Engine `6da2da111`).
 *
 * Engine: `POST /mcp-tokens {name, projects[]}` and `PUT /mcp-tokens/{id}/projects
 * {projects[]}` (core/routes/api.php:82, :84). A request without `projects`
 * mints an **unscoped** token that reaches every project
 * (`McpTokenController::store`, `TokenAbilities::build(projects: null)`), so the
 * key is always sent – an empty list included, which the Engine stores as the
 * `project` marker without names (no project).
 */
final class McpApiTest extends TestCase
{
    use EngineFixtures;

    private function api(): McpApi
    {
        return new McpApi(new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::ENGINE, '1|test-token')));
    }

    /**
     * @return array<string, array{list<string>}>
     */
    public static function scopes(): array
    {
        return [
            'some projects' => [['site1', 'site2']],
            'no project' => [[]],
        ];
    }

    /**
     * @param  list<string>  $projects
     */
    #[DataProvider('scopes')]
    public function test_a_token_is_always_minted_with_its_projects(array $projects): void
    {
        // Engine: core/app/Http/Controllers/McpTokenController.php:86 → store(), 201 {data:{…, projects, plain_text_token}}
        Http::fake(['engine.example.com/api/mcp-tokens' => Http::response(['data' => [
            'id' => 6, 'name' => 'Codex', 'projects' => $projects, 'last_used_at' => null, 'revoked_at' => null,
            'created_at' => '2026-10-13T00:00:00+00:00', 'plain_text_token' => '6|plain-secret',
        ]], 201)]);

        $token = $this->api()->createToken('Codex', $projects);

        $this->assertSame(6, $token['id']);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && $request->url() === self::ENGINE.'/mcp-tokens'
            && $request->data() === ['name' => 'Codex', 'projects' => $projects]);
    }

    public function test_the_scope_is_replaced_with_a_put(): void
    {
        // Engine: core/app/Http/Controllers/McpTokenController.php:130 → updateProjects(), {data:{id,name,projects,…}}
        Http::fake(['engine.example.com/api/mcp-tokens/6/projects' => Http::response(['data' => [
            'id' => 6, 'name' => 'Codex', 'projects' => ['site1'], 'last_used_at' => null, 'revoked_at' => null,
            'created_at' => '2026-10-13T00:00:00+00:00',
        ]])]);

        $token = $this->api()->setTokenProjects(6, ['site1']);

        $this->assertSame(['site1'], $token['projects']);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT'
            && $request->url() === self::ENGINE.'/mcp-tokens/6/projects'
            && $request->data() === ['projects' => ['site1']]);
    }
}
