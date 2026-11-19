<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Mcp\McpTokenService;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\McpToken;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use RuntimeException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;
use UnexpectedValueException;

/**
 * McpTokenService paths the token tests do not reach: the Engine a user with
 * several Engines gets, a mint that cannot be recorded, a list where Engines
 * fail and a revoke or delete the Engine refuses.
 */
class McpTokenServiceGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function service(): McpTokenService
    {
        return app(McpTokenService::class);
    }

    /**
     * Two Engines (ids 1 and 2) on `engine1.example.com` and `engine2.example.com`.
     */
    private function twoEngines(): void
    {
        $this->app->instance(EngineResolver::class, new class implements EngineResolver
        {
            public function forEngine(int $engineId): EngineClient
            {
                return new EngineClient(new EngineConnection($engineId, "https://engine{$engineId}.example.com/api", '1|test-token'));
            }

            public function defaultEngineId(): int
            {
                return 1;
            }

            public function engineIds(): array
            {
                return [1, 2];
            }
        });
        $this->rememberNoSelfProject(app(EngineResolver::class)->forEngine(1));
    }

    private function projectOn(int $engineId, string $username): Application
    {
        return Application::query()->create([
            'engine_id' => $engineId,
            'engine_username' => $username,
            'domain' => $username.'.example.com',
            'status' => 'active',
        ]);
    }

    private function token(User $user, int $engineId, int $engineTokenId): McpToken
    {
        return McpToken::query()->create([
            'user_id' => $user->id,
            'engine_id' => $engineId,
            'engine_token_id' => $engineTokenId,
            'name' => 'token '.$engineTokenId,
            'token_digest' => hash('sha256', 'secret'.$engineTokenId),
        ]);
    }

    public function test_the_engine_the_users_projects_are_on_takes_the_new_token(): void
    {
        $this->twoEngines();
        $user = User::factory()->create();
        $this->projectOn(1, 'shop');
        $this->projectOn(1, 'blog');

        $this->assertSame(1, $this->service()->engineFor($user));
    }

    public function test_a_user_without_projects_or_tokens_gets_the_default_engine(): void
    {
        $this->twoEngines();

        $this->assertSame(1, $this->service()->engineFor(User::factory()->create()));
    }

    public function test_the_engine_of_the_users_newest_token_takes_the_new_token(): void
    {
        $this->twoEngines();
        $user = User::factory()->create();
        $this->token($user, 1, 11);
        $this->token($user, 2, 21);

        $this->assertSame(2, $this->service()->engineFor($user));
    }

    public function test_a_token_the_engine_answers_without_an_id_is_not_recorded(): void
    {
        $this->configureEngine();

        // Engine: core/app/Http/Controllers/McpTokenController.php:86 -> store() (a body without an id)
        Http::fake(['engine.example.com/api/mcp-tokens' => Http::response(['data' => ['plain_text_token' => 'secret']], 201)]);

        try {
            $this->service()->mint(User::factory()->create(), 'assistant');
            $this->fail('A token without an id cannot be owned.');
        } catch (UnexpectedValueException) {
            $this->assertSame(0, McpToken::query()->count());
        }
    }

    public function test_a_token_that_cannot_be_recorded_is_deleted_again_even_when_that_fails(): void
    {
        $this->configureEngine();
        McpToken::creating(static function (): never {
            throw new RuntimeException('The row cannot be written.');
        });

        // Engine: core/app/Http/Controllers/McpTokenController.php:86 -> store(), 201
        // Engine: core/app/Http/Controllers/McpTokenController.php:148 -> destroy() (Engine 5xx)
        Http::fake([
            'engine.example.com/api/mcp-tokens' => Http::response(['data' => ['id' => 8, 'plain_text_token' => 'secret']], 201),
            'engine.example.com/api/mcp-tokens/8' => Http::response(['message' => 'boom'], 500),
        ]);

        try {
            $this->service()->mint(User::factory()->create(), 'assistant');
            $this->fail('The recording failure must reach the caller.');
        } catch (RuntimeException $e) {
            $this->assertSame('The row cannot be written.', $e->getMessage());
        }

        Http::assertSent(fn ($request): bool => $request->method() === 'DELETE' && str_ends_with($request->url(), '/mcp-tokens/8'));
    }

    public function test_the_list_keeps_the_engines_that_answer_when_another_fails(): void
    {
        $this->twoEngines();
        $user = User::factory()->create();
        $this->token($user, 1, 11);
        $this->token($user, 2, 21);

        // Engine: core/app/Http/Controllers/McpTokenController.php:35 -> index() (Engine 1 answers, Engine 2 fails)
        Http::fake([
            'engine1.example.com/api/mcp-tokens' => Http::response(['data' => [['id' => 11, 'name' => 'token 11']]]),
            'engine2.example.com/api/mcp-tokens' => Http::response(['message' => 'boom'], 500),
        ]);

        $tokens = $this->service()->tokensOf($user);

        $this->assertSame([11], array_map(static fn (array $token): int => (int) $token['id'], $tokens));
        $this->assertSame(1, McpToken::query()->where('engine_id', 2)->count());
    }

    public function test_the_list_fails_when_no_engine_answers(): void
    {
        $this->twoEngines();
        $user = User::factory()->create();
        $this->token($user, 1, 11);
        $this->token($user, 2, 21);

        // Engine: core/app/Http/Controllers/McpTokenController.php:35 -> index() (both Engines fail)
        Http::fake(['*' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        $this->service()->tokensOf($user);
    }

    public function test_the_list_fails_when_every_engine_is_down(): void
    {
        $this->twoEngines();
        $user = User::factory()->create();
        $this->token($user, 1, 11);
        $this->token($user, 2, 21);
        Cache::flush();
        foreach ([1, 2] as $engineId) {
            app(EngineHealth::class)->open($engineId);
        }

        $this->expectException(EngineUnavailableException::class);

        $this->service()->tokensOf($user);
    }

    public function test_revoking_all_tokens_stops_at_an_engine_failure_that_is_not_a_404(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->token($user, 1, 11);

        // Engine: core/app/Http/Controllers/McpTokenController.php:148 -> destroy (revoke route; Engine 5xx)
        Http::fake(['engine.example.com/api/mcp-tokens/11/revoke' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        $this->service()->revokeAllOf($user);
    }

    public function test_deleting_all_tokens_stops_at_an_engine_failure_that_is_not_a_404(): void
    {
        $this->configureEngine();
        $user = User::factory()->create();
        $this->token($user, 1, 11);

        // Engine: core/app/Http/Controllers/McpTokenController.php:148 -> destroy() (Engine 5xx)
        Http::fake(['engine.example.com/api/mcp-tokens/11' => Http::response(['message' => 'boom'], 500)]);

        try {
            $this->service()->deleteAllOf($user);
            $this->fail('A refused delete must reach the caller.');
        } catch (EngineRequestException) {
            $this->assertSame(1, McpToken::query()->count());
        }
    }
}
