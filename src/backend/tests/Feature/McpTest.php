<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Mockery;
use PanelAlpha\ClientArea\Models\McpToken;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Connect AI (MCP tokens and activity logs) proxied to the
 * Engine.
 *
 * CA: `apis/Api.js:121-125` (`Api.mcp.*`); token list reads `response.data.data`
 * (`McpTokensSection.vue:231`), create reads `response.data.data.plain_text_token`
 * (`McpTokenCreateModal.vue:143-144`), activity reads `response.data.data` and
 * `response.data.total` (`McpActivityLog.vue:251-252`). The Connect AI server URL
 * is built client-side today (`ConnectAi.vue:150-153`).
 *
 * Engine: `core/routes/api.php:91-97`; token shapes in
 * `core/app/Http/Controllers/McpTokenController.php:13-57`; the activity list is
 * a bare paginator (`core/app/Http/Controllers/McpActivityLogController.php:12-26`).
 *
 * Old: `packages/api/routes/api.php:746-750`,
 * `packages/api/app/Http/Controllers/User/McpTokenController.php:20-109`.
 */
class McpTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Cache::flush();
    }

    /**
     * The panel shows, revokes and deletes only the tokens it
     * recorded for the user, so a test of those routes owns its token first.
     */
    private function ownedToken(User $user, int $engineTokenId): McpToken
    {
        return McpToken::query()->create([
            'user_id' => $user->id,
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_token_id' => $engineTokenId,
            'name' => 'Claude',
        ]);
    }

    public function test_mcp_tokens_are_listed_from_the_engine(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->ownedToken($user, 5);
        // Engine: core/app/Http/Controllers/McpTokenController.php:35 -> index()
        Http::fake(['engine.example.com/api/mcp-tokens' => Http::response(['data' => [
            ['id' => 5, 'name' => 'Claude', 'last_used_at' => null, 'revoked_at' => null, 'created_at' => '2026-10-11T00:00:00+00:00'],
        ]])]);

        // CA: packages/client-area/src/views/connect-ai/McpTokensSection.vue:229
        $response = $this->actingAs($user)->getJson('/api/mcp-tokens');

        // CA reads: packages/client-area/src/views/connect-ai/McpTokensSection.vue:231
        $response->assertOk()
            ->assertJsonPath('data.0.id', 5)
            ->assertJsonPath('data.0.name', 'Claude');
    }

    public function test_mcp_token_creation_returns_the_plain_text_token(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/McpTokenController.php:86 -> store()
        Http::fake(['engine.example.com/api/mcp-tokens' => Http::response(['data' => [
            'id' => 6, 'name' => 'Codex', 'last_used_at' => null, 'revoked_at' => null,
            'created_at' => '2026-10-11T00:00:00+00:00', 'plain_text_token' => '6|plain-secret',
        ]], 201)]);

        // CA: packages/client-area/src/views/connect-ai/McpTokenCreateModal.vue:141
        $response = $this->actingAs(User::factory()->create())
            ->postJson('/api/mcp-tokens', ['name' => 'Codex']);

        // CA reads: packages/client-area/src/views/connect-ai/McpTokenCreateModal.vue:144
        $response->assertStatus(201)->assertJsonPath('data.plain_text_token', '6|plain-secret');

        Http::assertSent(static fn ($request): bool => $request->method() === 'POST'
            && str_contains($request->url(), '/api/mcp-tokens')
            && ($request->data()['name'] ?? null) === 'Codex');
    }

    public function test_a_minted_token_is_scoped_to_the_users_projects(): void
    {
        // The panel never asks the Engine for an unscoped
        // token; the scope is every project of the user (Community: every mirrored
        // project), never the panel's own.
        config(['client-area.self_project' => 'panelv1']);
        $user = User::factory()->create();
        $this->syncedApplication($user, 'site1');
        // Engine: core/app/Http/Controllers/McpTokenController.php:86 -> store()
        Http::fake(['engine.example.com/api/mcp-tokens' => Http::response(['data' => [
            'id' => 6, 'name' => 'Codex', 'projects' => ['site1'], 'last_used_at' => null, 'revoked_at' => null,
            'created_at' => '2026-10-11T00:00:00+00:00', 'plain_text_token' => '6|plain-secret',
        ]], 201)]);

        // CA: packages/client-area/src/views/connect-ai/McpTokenCreateModal.vue:141
        $this->actingAs($user)->postJson('/api/mcp-tokens', ['name' => 'Codex'])->assertStatus(201);

        Http::assertSent(static fn ($request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/api/mcp-tokens')
            && $request->data() === ['name' => 'Codex', 'projects' => ['site1']]);
    }

    public function test_a_token_for_a_user_without_projects_is_scoped_to_none(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/McpTokenController.php:86 -> store()
        Http::fake(['engine.example.com/api/mcp-tokens' => Http::response(['data' => [
            'id' => 6, 'name' => 'Codex', 'projects' => [], 'last_used_at' => null, 'revoked_at' => null,
            'created_at' => '2026-10-11T00:00:00+00:00', 'plain_text_token' => '6|plain-secret',
        ]], 201)]);

        // CA: packages/client-area/src/views/connect-ai/McpTokenCreateModal.vue:141
        $this->actingAs(User::factory()->create())->postJson('/api/mcp-tokens', ['name' => 'Codex'])->assertStatus(201);

        // The `projects` key is sent even when empty: without it the Engine
        // mints an unscoped token (McpTokenController::store, TokenAbilities::build).
        Http::assertSent(static fn ($request): bool => $request->method() === 'POST'
            && $request->data() === ['name' => 'Codex', 'projects' => []]);
    }

    public function test_mcp_token_revocation_is_proxied(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->ownedToken($user, 5);
        // Engine: core/app/Http/Controllers/McpTokenController.php:140-146 -> revoke()
        Http::fake(['engine.example.com/api/mcp-tokens/5/revoke' => Http::response(['data' => [
            'id' => 5, 'name' => 'Claude', 'last_used_at' => null,
            'revoked_at' => '2026-10-11T01:00:00+00:00', 'created_at' => '2026-10-11T00:00:00+00:00',
        ]])]);

        // CA: packages/client-area/src/apis/Api.js:123
        $response = $this->actingAs($user)->putJson('/api/mcp-tokens/5/revoke');

        // CA reads: packages/client-area/src/views/connect-ai/McpTokensSection.vue:98
        $response->assertOk()->assertJsonPath('data.revoked_at', '2026-10-11T01:00:00+00:00');
    }

    public function test_mcp_token_deletion_is_proxied(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->ownedToken($user, 5);
        // Engine: core/app/Http/Controllers/McpTokenController.php:148-154 -> destroy()
        Http::fake(['engine.example.com/api/mcp-tokens/5' => Http::response(['data' => ['id' => 5]])]);

        // CA: packages/client-area/src/apis/Api.js:124
        $this->actingAs($user)->deleteJson('/api/mcp-tokens/5')->assertOk();

        Http::assertSent(static fn ($request): bool => $request->method() === 'DELETE'
            && str_contains($request->url(), '/api/mcp-tokens/5'));
    }

    public function test_mcp_activity_logs_are_proxied_with_the_paginator(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/McpActivityLogController.php:37-56 -> index()
        Http::fake(['engine.example.com/api/mcp-activity-logs*' => Http::response([
            'current_page' => 1,
            'data' => [[
                'id' => 1, 'token_name' => 'Claude', 'tool_name' => 'call_api',
                'status' => 'success', 'created_at' => '2026-10-11T00:00:00+00:00',
            ]],
            'per_page' => 20,
            'total' => 1,
        ])]);

        // CA: packages/client-area/src/views/connect-ai/McpActivityLog.vue:249
        $response = $this->actingAs(User::factory()->create())
            ->getJson('/api/mcp-activity-logs?page=2&token_name=Claude');

        // The CA's filters are forwarded to the Engine (McpActivityLog.vue:247-248).
        Http::assertSent(static fn ($request): bool => str_contains($request->url(), 'token_name=Claude')
            && str_contains($request->url(), 'page=2'));

        // CA reads: packages/client-area/src/views/connect-ai/McpActivityLog.vue:251
        $response->assertOk()
            ->assertJsonPath('data.0.tool_name', 'call_api')
            // CA reads: packages/client-area/src/views/connect-ai/McpActivityLog.vue:252
            ->assertJsonPath('total', 1);
    }

    /**
     * Since Engine 2.2.0 (`3e9b4b2c5`), outside single-user mode the Engine's
     * log mixes every user's tokens, so the panel asks for the user's own with
     * `token_ids[]` – a deleted token included, since the Engine keeps its id
     * on its calls.
     */
    public function test_a_multi_user_edition_filters_the_activity_by_the_users_tokens(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $other = User::factory()->create();
        $this->ownedToken($user, 5);
        $this->ownedToken($user, 6)->delete();
        $this->ownedToken($other, 7);
        $this->bindMultiUserEdition([$user->id => [], $other->id => []]);
        // Engine: core/app/Http/Controllers/McpActivityLogController.php:37-56 -> index() (token_ids[] on 2.2.0)
        Http::fake(['engine.example.com/api/mcp-activity-logs*' => Http::response([
            'current_page' => 2,
            'data' => [['id' => 9, 'token_id' => 6, 'token_name' => 'Old', 'tool_name' => 'call_api', 'status' => 'success', 'created_at' => '2026-10-11T00:00:00+00:00']],
            'per_page' => 20,
            'total' => 21,
        ])]);

        // CA: packages/client-area/src/views/connect-ai/McpActivityLog.vue:249
        $response = $this->actingAs($user)->getJson('/api/mcp-activity-logs?page=2&token_name=Claude');

        // CA reads: packages/client-area/src/views/connect-ai/McpActivityLog.vue:251
        $response->assertOk()
            ->assertJsonPath('data.0.token_name', 'Old')
            // CA reads: packages/client-area/src/views/connect-ai/McpActivityLog.vue:252
            ->assertJsonPath('total', 21);
        Http::assertSent(static function ($request): bool {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return str_contains($request->url(), '/api/mcp-activity-logs')
                && $query === ['token_name' => 'Claude', 'page' => '2', 'token_ids' => ['5', '6']];
        });
    }

    public function test_a_multi_user_edition_user_without_tokens_gets_an_empty_page_without_an_engine_call(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->ownedToken(User::factory()->create(), 7);
        $this->bindMultiUserEdition([$user->id => []]);
        Http::fake();

        // CA: packages/client-area/src/views/connect-ai/McpActivityLog.vue:249
        $response = $this->actingAs($user)->getJson('/api/mcp-activity-logs?page=2&token_name=Claude');

        // CA reads: packages/client-area/src/views/connect-ai/McpActivityLog.vue:251
        $response->assertOk()
            ->assertJsonPath('data', [])
            // CA reads: packages/client-area/src/views/connect-ai/McpActivityLog.vue:252
            ->assertJsonPath('total', 0);
        // The Engine's `paginate(20)` keys (core/app/Http/Controllers/McpActivityLogController.php:55).
        $this->assertSame(
            ['current_page', 'data', 'first_page_url', 'from', 'last_page', 'last_page_url', 'links', 'next_page_url', 'path', 'per_page', 'prev_page_url', 'to', 'total'],
            collect((array) $response->json())->keys()->sort()->values()->all(),
        );
        $this->assertSame(2, $response->json('current_page'));
        $this->assertSame(20, $response->json('per_page'));
        Http::assertNothingSent();
    }

    /**
     * A deleted token keeps its row (soft-deleted) so its calls stay in
     * the log, but it is gone from the token list and the `/mcp` gatekeeper.
     */
    public function test_a_deleted_token_keeps_its_row_but_is_gone_everywhere_else(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->ownedToken($user, 5);
        Http::fake([
            // Engine: core/app/Http/Controllers/McpTokenController.php:148-154 -> destroy()
            'engine.example.com/api/mcp-tokens/5' => Http::response(['data' => ['id' => 5]]),
            // Engine: core/app/Http/Controllers/McpTokenController.php:35 -> index() (the deleted token is no longer listed)
            'engine.example.com/api/mcp-tokens' => Http::response(['data' => []]),
        ]);

        // CA: packages/client-area/src/apis/Api.js:124
        $this->actingAs($user)->deleteJson('/api/mcp-tokens/5')->assertOk();

        $this->assertSoftDeleted('mcp_tokens', ['engine_token_id' => 5]);
        $this->assertFalse(app(\PanelAlpha\ClientArea\Mcp\McpGate::class)->admits('5|secret', 1));
        // CA: packages/client-area/src/apis/Api.js:121
        $list = $this->actingAs($user)->getJson('/api/mcp-tokens')->assertOk();
        // CA reads: packages/client-area/src/views/connect-ai/McpTokensSection.vue:231 (data)
        $list->assertExactJson(['data' => []]);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function mcpRoutes(): array
    {
        return [
            'tokens.index' => ['GET', '/api/mcp-tokens'],
            'tokens.store' => ['POST', '/api/mcp-tokens'],
            'tokens.revoke' => ['PUT', '/api/mcp-tokens/5/revoke'],
            'tokens.destroy' => ['DELETE', '/api/mcp-tokens/5'],
            'activity_logs.index' => ['GET', '/api/mcp-activity-logs'],
        ];
    }

    #[DataProvider('mcpRoutes')]
    public function test_mcp_routes_require_authentication(string $method, string $uri): void
    {
        // CA: packages/client-area/src/apis/Api.js:121
        $this->json($method, $uri)->assertUnauthorized();
    }

    public function test_mcp_token_creation_validates_the_name(): void
    {
        $this->configureEngine();

        // CA: packages/client-area/src/views/connect-ai/McpTokenCreateModal.vue:141
        $this->actingAs(User::factory()->create())
            ->postJson('/api/mcp-tokens', [])
            ->assertStatus(422);
    }

    public function test_mcp_proxy_reports_a_down_engine(): void
    {
        $this->configureEngine();
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/apis/Api.js:121
        $this->actingAs(User::factory()->create())->getJson('/api/mcp-tokens')->assertStatus(503);
    }

    public function test_mcp_proxy_maps_an_engine_5xx_to_502(): void
    {
        $this->configureEngine();
        // Defensive (not an Engine shape): any Engine transport failure body
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 500)]);

        // CA: packages/client-area/src/apis/Api.js:121
        $this->actingAs(User::factory()->create())->getJson('/api/mcp-tokens')->assertStatus(502);
    }

    public function test_home_exposes_the_engine_mcp_url(): void
    {
        $this->configureEngine();

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $response = $this->actingAs(User::factory()->create())->getJson('/api/home');

        // The CA builds the URL client-side (ConnectAi.vue:150-153) and does not
        // read this field; it is the documented source of truth. The value is
        // derived from engine-api-url's origin plus the Engine's /mcp path
        //Never the unreachable public mcp_url.
        $response->assertOk();
        $this->assertSame('https://engine.example.com/mcp', $response->json('app.mcp_url'));
    }

    public function test_home_exposes_the_overridden_mcp_url(): void
    {
        // The `engine-mcp-url` setting (mapped onto
        // `client-area.mcp_url`) reaches the Engine client as the caller's
        // override; the client reads no panel config itself.
        $this->configureEngine();
        config(['client-area.mcp_url' => 'https://mcp.example.com/custom-mcp/']);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $response = $this->actingAs(User::factory()->create())->getJson('/api/home');

        $response->assertOk();
        $this->assertSame('https://mcp.example.com/custom-mcp', $response->json('app.mcp_url'));
    }

    public function test_mcp_token_mutations_log_the_old_activity_names(): void
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/McpTokenController.php:86 -> store() (201)
        // Engine: core/app/Http/Controllers/McpTokenController.php:140-146 -> revoke() (200)
        // Engine: core/app/Http/Controllers/McpTokenController.php:148-154 -> destroy() (200)
        Http::fake([
            'engine.example.com/api/mcp-tokens' => Http::response(['data' => [
                'id' => 5, 'name' => 'Codex', 'last_used_at' => null, 'revoked_at' => null,
                'created_at' => '2026-10-11T00:00:00+00:00', 'plain_text_token' => '5|secret',
            ]], 201),
            'engine.example.com/api/mcp-tokens/5/revoke' => Http::response(['data' => [
                'id' => 5, 'name' => 'Claude', 'last_used_at' => null,
                'revoked_at' => '2026-10-11T01:00:00+00:00', 'created_at' => '2026-10-11T00:00:00+00:00',
            ]]),
            'engine.example.com/api/mcp-tokens/5' => Http::response(['data' => ['id' => 5]]),
        ]);

        $user = User::factory()->create();

        // CA: packages/client-area/src/apis/Api.js:122
        $this->actingAs($user)->postJson('/api/mcp-tokens', ['name' => 'Codex'])->assertStatus(201);
        // CA: packages/client-area/src/apis/Api.js:123
        $this->actingAs($user)->putJson('/api/mcp-tokens/5/revoke')->assertOk();
        // CA: packages/client-area/src/apis/Api.js:124
        $this->actingAs($user)->deleteJson('/api/mcp-tokens/5')->assertOk();

        // The old panel's LogRequests wrote the route name
        // (packages/api/routes/api.php:750-752).
        foreach (['user.mcp.tokens.store', 'user.mcp.tokens.revoke', 'user.mcp.tokens.destroy'] as $action) {
            $this->assertDatabaseHas('activity_logs', ['action' => $action]);
        }
    }

    public function test_mcp_resolves_the_default_engine_through_the_contract(): void
    {
        // Panel-wide MCP routes must ask the resolver for the default Engine
        // instead of hard-coding DEFAULT_ID in the core package (§7.1). A
        // hard-coded id reaches forEngine(DEFAULT_ID) and this expectation fails.
        $client = new EngineClient(new EngineConnection(7, self::ENGINE, '1|test-token'));
        $resolver = Mockery::mock(EngineResolver::class);
        $resolver->shouldReceive('defaultEngineId')->once()->andReturn(7);
        // The token Engine asks how many Engines there are; with
        // one it is the default, still never DEFAULT_ID.
        $resolver->shouldReceive('engineIds')->andReturn([7]);
        $resolver->shouldReceive('forEngine')->once()->with(7)->andReturn($client);
        $this->app->instance(EngineResolver::class, $resolver);

        // Engine: core/app/Http/Controllers/McpTokenController.php:35 -> index()
        Http::fake(['engine.example.com/api/mcp-tokens' => Http::response(['data' => []])]);

        // CA: packages/client-area/src/views/connect-ai/McpTokensSection.vue:229
        $this->actingAs(User::factory()->create())->getJson('/api/mcp-tokens')->assertOk();
    }
}
