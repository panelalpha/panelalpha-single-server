<?php

namespace Tests\Feature\ClientArea\Mcp;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\McpToken;
use PanelAlpha\EngineClient\EngineConnection;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The Connect AI token routes work per user. Same
 * URIs, names, middleware and activity names as before; the bodies are still
 * the Engine's token objects, `projects` included.
 *
 * - `POST /api/mcp-tokens` mints the token scoped to the user's projects and
 *   records the row; when the row cannot be recorded the Engine token is
 *   deleted again (no orphan).
 * - `GET /api/mcp-tokens` reads the Engine list once and keeps the user's
 *   tokens; a row whose Engine token is gone is deleted.
 * - `PUT /api/mcp-tokens/{id}/revoke` and `DELETE /api/mcp-tokens/{id}` answer
 *   404 for a token the user does not own, with no Engine call; `DELETE` also
 *   drops the row.
 *
 * CA: `apis/Api.js:121-125` (`Api.mcp.*`); the list reads `response.data.data`
 * (`McpTokensSection.vue:231`), create reads `response.data.data.plain_text_token`
 * (`McpTokenCreateModal.vue:144`), revoke reads `revoked_at`
 * (`McpTokensSection.vue:98`).
 *
 * Engine: `core/routes/api.php:81-85`; token objects from
 * `core/app/Http/Controllers/McpTokenController.php:178-188` (`formatToken`:
 * id, name, projects, last_used_at, revoked_at, created_at), the create answer
 * adds `plain_text_token` (`:97-102`), delete answers `{data:{id}}` (`:153`).
 */
final class McpTokenOwnershipTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const SECRET = '6|ZpF0m3cretPlainTextTokenValue0000000000';

    /**
     * @param  list<string>  $projects
     * @return array<string, mixed>
     */
    private function engineToken(int $id, string $name = 'Claude', array $projects = []): array
    {
        return [
            'id' => $id, 'name' => $name, 'projects' => $projects, 'last_used_at' => null,
            'revoked_at' => null, 'created_at' => '2026-10-13T00:00:00+00:00',
        ];
    }

    private function own(User $user, int $engineTokenId): McpToken
    {
        return McpToken::query()->create([
            'user_id' => $user->id,
            'engine_id' => EngineConnection::DEFAULT_ID,
            'engine_token_id' => $engineTokenId,
            'name' => 'Claude',
        ]);
    }

    public function test_a_minted_token_is_recorded_for_its_user(): void
    {
        $user = User::factory()->create();
        $this->syncedApplication($user, 'site1');
        // Engine: core/app/Http/Controllers/McpTokenController.php:86 -> store(), 201
        Http::fake(['engine.example.com/api/mcp-tokens' => Http::response(['data' => [
            ...$this->engineToken(6, 'Codex', ['site1']), 'plain_text_token' => self::SECRET,
        ]], 201)]);

        // CA: packages/client-area/src/views/connect-ai/McpTokenCreateModal.vue:141
        $response = $this->actingAs($user)->postJson('/api/mcp-tokens', ['name' => 'Codex']);

        // CA reads: packages/client-area/src/views/connect-ai/McpTokenCreateModal.vue:144
        $response->assertStatus(201)
            ->assertJsonPath('data.plain_text_token', self::SECRET)
            ->assertJsonPath('data.projects', ['site1']);
        $this->assertSame(
            [['user_id' => $user->id, 'engine_id' => 1, 'engine_token_id' => 6, 'name' => 'Codex']],
            McpToken::query()->get(['user_id', 'engine_id', 'engine_token_id', 'name'])->toArray(),
        );
    }

    public function test_a_token_that_cannot_be_recorded_is_deleted_on_the_engine(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        // The Engine hands back an id the panel already recorded: the row
        // cannot be written, so the token must not stay on the Engine unowned.
        $this->own(User::factory()->create(), 6);
        // Engine: core/app/Http/Controllers/McpTokenController.php:86 -> store(), 201
        // Engine: core/app/Http/Controllers/McpTokenController.php:148 -> destroy(), {data:{id}}
        Http::fake([
            'engine.example.com/api/mcp-tokens' => Http::response(['data' => [
                ...$this->engineToken(6, 'Codex'), 'plain_text_token' => self::SECRET,
            ]], 201),
            'engine.example.com/api/mcp-tokens/6' => Http::response(['data' => ['id' => 6]]),
        ]);
        $logged = $this->captureLogs();

        // CA: packages/client-area/src/views/connect-ai/McpTokenCreateModal.vue:141
        $response = $this->actingAs($user)->postJson('/api/mcp-tokens', ['name' => 'Codex']);

        $response->assertStatus(500);
        Http::assertSent(static fn ($request): bool => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/api/mcp-tokens/6'));
        $this->assertFalse(McpToken::query()->where('user_id', $user->id)->exists());
        // The plain-text token never reaches the answer of a failed mint or a log.
        $this->assertStringNotContainsString(self::SECRET, (string) $response->getContent());
        $this->assertNotSame([], $logged->messages, 'the recording failure is reported');
        $this->assertStringNotContainsString('ZpF0m3cret', implode("\n", $logged->messages));
    }

    public function test_the_list_shows_only_the_users_tokens_from_one_engine_read(): void
    {
        $this->configureEngine();
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->own($alice, 5);
        $this->own($bob, 6);
        // Alice's row whose Engine token was deleted elsewhere.
        $this->own($alice, 9);
        // Engine: core/app/Http/Controllers/McpTokenController.php:35 -> index(), newest first
        Http::fake(['engine.example.com/api/mcp-tokens' => Http::response(['data' => [
            $this->engineToken(7, 'Operator'),
            $this->engineToken(6),
            $this->engineToken(5),
        ]])]);

        // CA: packages/client-area/src/views/connect-ai/McpTokensSection.vue:229
        $response = $this->actingAs($alice)->getJson('/api/mcp-tokens');

        // CA reads: packages/client-area/src/views/connect-ai/McpTokensSection.vue:231
        $response->assertOk()->assertExactJson(['data' => [$this->engineToken(5)]]);
        $this->assertCount(1, Http::recorded());
        // The stale row goes; another user's row and an unowned Engine token are untouched.
        $this->assertSame([5, 6], McpToken::query()->orderBy('engine_token_id')->pluck('engine_token_id')->all());
    }

    public function test_a_token_the_user_does_not_own_is_404_without_an_engine_call(): void
    {
        $this->configureEngine();
        $alice = User::factory()->create();
        $this->own(User::factory()->create(), 6);
        Http::fake();

        // 6 is another user's token, 7 is the Engine operator's own (no row).
        foreach ([6, 7] as $id) {
            // CA: packages/client-area/src/apis/Api.js:123
            $this->actingAs($alice)->putJson("/api/mcp-tokens/{$id}/revoke")->assertNotFound();
            // CA: packages/client-area/src/apis/Api.js:124
            $this->actingAs($alice)->deleteJson("/api/mcp-tokens/{$id}")->assertNotFound();
        }

        Http::assertNothingSent();
        $this->assertTrue(McpToken::query()->where('engine_token_id', 6)->exists());
        // A refused mutation logs no activity.
        $this->assertDatabaseMissing('activity_logs', ['user_id' => $alice->id]);
    }

    public function test_deleting_an_owned_token_drops_its_row(): void
    {
        $this->configureEngine();
        $alice = User::factory()->create();
        $this->own($alice, 5);
        // Engine: core/app/Http/Controllers/McpTokenController.php:148 -> destroy(), {data:{id}}
        Http::fake(['engine.example.com/api/mcp-tokens/5' => Http::response(['data' => ['id' => 5]])]);

        // CA: packages/client-area/src/apis/Api.js:124
        $this->actingAs($alice)->deleteJson('/api/mcp-tokens/5')->assertOk();

        $this->assertSame(0, McpToken::query()->count());
    }

    public function test_two_users_never_see_revoke_or_delete_each_others_tokens(): void
    {
        $this->configureEngine();
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        // Engine: core/app/Http/Controllers/McpTokenController.php:86 -> store(), 201
        // Engine: core/app/Http/Controllers/McpTokenController.php:35 -> index()
        // Engine: core/app/Http/Controllers/McpTokenController.php:140 -> revoke()
        // Engine: core/app/Http/Controllers/McpTokenController.php:148 -> destroy()
        Http::fake([
            'engine.example.com/api/mcp-tokens' => Http::sequence()
                ->push(['data' => [...$this->engineToken(5, 'Alice AI'), 'plain_text_token' => '5|alice-secret']], 201)
                ->push(['data' => [...$this->engineToken(6, 'Bob AI'), 'plain_text_token' => '6|bob-secret']], 201)
                ->push(['data' => [$this->engineToken(6, 'Bob AI'), $this->engineToken(5, 'Alice AI')]])
                ->push(['data' => [$this->engineToken(6, 'Bob AI'), $this->engineToken(5, 'Alice AI')]]),
            'engine.example.com/api/mcp-tokens/6/revoke' => Http::response(['data' => [
                ...$this->engineToken(6, 'Bob AI'), 'revoked_at' => '2026-10-13T01:00:00+00:00',
            ]]),
            'engine.example.com/api/mcp-tokens/6' => Http::response(['data' => ['id' => 6]]),
        ]);

        // CA: packages/client-area/src/views/connect-ai/McpTokenCreateModal.vue:141
        $this->actingAs($alice)->postJson('/api/mcp-tokens', ['name' => 'Alice AI'])->assertStatus(201);
        // CA: packages/client-area/src/views/connect-ai/McpTokenCreateModal.vue:141
        $this->actingAs($bob)->postJson('/api/mcp-tokens', ['name' => 'Bob AI'])->assertStatus(201);

        // CA: packages/client-area/src/views/connect-ai/McpTokensSection.vue:229
        $aliceList = $this->actingAs($alice)->getJson('/api/mcp-tokens');
        // CA reads: packages/client-area/src/views/connect-ai/McpTokensSection.vue:231
        $aliceList->assertOk()->assertJsonPath('data.*.id', [5]);
        // CA: packages/client-area/src/views/connect-ai/McpTokensSection.vue:229
        $bobList = $this->actingAs($bob)->getJson('/api/mcp-tokens');
        // CA reads: packages/client-area/src/views/connect-ai/McpTokensSection.vue:231
        $bobList->assertOk()->assertJsonPath('data.*.id', [6]);

        $sent = count(Http::recorded());
        // CA: packages/client-area/src/apis/Api.js:123
        $this->actingAs($alice)->putJson('/api/mcp-tokens/6/revoke')->assertNotFound();
        // CA: packages/client-area/src/apis/Api.js:124
        $this->actingAs($alice)->deleteJson('/api/mcp-tokens/6')->assertNotFound();
        $this->assertCount($sent, Http::recorded(), 'a refused revoke/delete makes no Engine call');

        // CA: packages/client-area/src/apis/Api.js:123
        $revoked = $this->actingAs($bob)->putJson('/api/mcp-tokens/6/revoke');
        // CA reads: packages/client-area/src/views/connect-ai/McpTokensSection.vue:98
        $revoked->assertOk()->assertJsonPath('data.revoked_at', '2026-10-13T01:00:00+00:00');
        // CA: packages/client-area/src/apis/Api.js:124
        $this->actingAs($bob)->deleteJson('/api/mcp-tokens/6')->assertOk();
        $this->assertSame([5], McpToken::query()->pluck('engine_token_id')->all());
    }

    /**
     * Every log line written from here on, with its context (an exception's
     * text and trace included).
     */
    private function captureLogs(): object
    {
        $logged = new class
        {
            /** @var list<string> */
            public array $messages = [];
        };
        Event::listen(MessageLogged::class, static function (MessageLogged $event) use ($logged): void {
            $context = [];
            foreach ($event->context as $key => $value) {
                $context[] = $key.'='.($value instanceof \Throwable ? (string) $value : json_encode($value));
            }
            $logged->messages[] = $event->message.' '.implode(' ', $context);
        });

        return $logged;
    }
}
