<?php

namespace Tests\Feature\ClientArea\Mcp;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use PanelAlpha\ClientArea\Mcp\McpGate;
use PanelAlpha\ClientArea\Models\McpToken;
use PanelAlpha\EngineClient\EngineConnection;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * `POST /mcp` and `GET /mcp/check` are a gatekeeper. The panel forwards a
 * request only when the bearer is a Sanctum plain-text token `<id>|<secret>`, `<id>` is an `mcp_tokens.engine_token_id` on
 * the default Engine and its user still exists; anything else answers 401
 * `{"message":"Unauthenticated."}` with `WWW-Authenticate: Bearer` and makes no
 * Engine call. The Engine still checks the secret, revocation and scope. The
 * streaming itself is unchanged (`McpProxyTest`).
 *
 * CA: the Connect AI page points the assistant at `<panel>/mcp`
 * (`ConnectAi.vue:150-153`); the assistant sends the token minted through
 * `McpTokenCreateModal.vue:141`.
 * Engine: `core/app/Mcp/Servers/EngineServer.php:61` (`/mcp`) and
 * `core/app/Http/Controllers/McpTokenController.php:161` (`/mcp/check`); the
 * tokens are Sanctum plain-text tokens (`McpTokenController.php:100`,
 * `plain_text_token`).
 */
final class McpGateTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['sanctum.stateful' => []]);
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/McpTokenController.php:161 -> check()
        // Engine: core/app/Mcp/Servers/EngineServer.php:61 -> class EngineServer extends Server
        Http::fake([
            'engine.example.com/mcp/check' => Http::response(['valid' => true]),
            'engine.example.com/mcp' => Http::response(['jsonrpc' => '2.0', 'id' => 1, 'result' => []]),
        ]);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function routes(): array
    {
        return [
            'POST /mcp' => ['POST', '/mcp'],
            'GET /mcp/check' => ['GET', '/mcp/check'],
        ];
    }

    #[DataProvider('routes')]
    public function test_an_owned_token_is_forwarded(string $method, string $uri): void
    {
        $bearer = $this->ownedMcpBearer(6);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->json($method, $uri, ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])->assertOk();

        Http::assertSent(static fn ($request): bool => str_starts_with($request->url(), 'https://engine.example.com/mcp')
            && $request->hasHeader('Authorization', 'Bearer '.$bearer));
    }

    /**
     * @return array<string, array{string, string, ?string}>
     */
    public static function refusals(): array
    {
        $cases = [];
        foreach (self::routes() as $route => [$method, $uri]) {
            foreach ([
                'an unknown token id' => '99|pAnelMintedS3cretOf40CharactersXXXXXXXXXX',
                'a bearer without an id' => 'client-token',
                'an id without a secret' => '6|',
                'a secret without an id' => '|pAnelMintedS3cretOf40CharactersXXXXXXXXXX',
                'a non-numeric id' => 'six|pAnelMintedS3cretOf40CharactersXXXXXXXXXX',
                'a zero-padded id' => '06|pAnelMintedS3cretOf40CharactersXXXXXXXXXX',
                'no bearer' => null,
            ] as $case => $bearer) {
                $cases["{$route}: {$case}"] = [$method, $uri, $bearer];
            }
        }

        return $cases;
    }

    #[DataProvider('refusals')]
    public function test_a_token_the_panel_did_not_mint_is_refused_without_an_engine_call(string $method, string $uri, ?string $bearer): void
    {
        // Token 6 exists, so the refusals are about the bearer, not an empty table.
        $this->ownedMcpBearer(6);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $response = $this->json($method, $uri, ['jsonrpc' => '2.0'], $bearer === null ? [] : ['Authorization' => 'Bearer '.$bearer]);

        $this->assertUnauthenticated($response);
    }

    #[DataProvider('routes')]
    public function test_a_token_of_a_deleted_user_is_refused(string $method, string $uri): void
    {
        $user = User::factory()->create();
        $bearer = $this->ownedMcpBearer(6, $user);
        $user->delete();

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->assertUnauthenticated($this->json($method, $uri, ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer]));
    }

    #[DataProvider('routes')]
    public function test_a_row_whose_user_is_gone_is_refused_even_without_the_cascade(string $method, string $uri): void
    {
        // An edition's users table may carry no FK to `mcp_tokens` (or a user
        // may be removed behind the panel's back): the gate asks the configured
        // user provider itself. Here the provider's model no longer finds the
        // owner although the row is still there.
        $bearer = $this->ownedMcpBearer(6);
        $gone = new class extends User
        {
            protected $table = 'users';

            protected static function booted(): void
            {
                static::addGlobalScope('gone', static fn ($query) => $query->whereRaw('1 = 0'));
            }
        };
        config(['auth.providers.users.model' => $gone::class]);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->assertUnauthenticated($this->json($method, $uri, ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer]));
        $this->assertSame(1, McpToken::query()->count());
    }

    #[DataProvider('routes')]
    public function test_a_token_recorded_for_another_engine_is_refused(string $method, string $uri): void
    {
        McpToken::query()->create(['user_id' => User::factory()->create()->id, 'engine_id' => EngineConnection::DEFAULT_ID + 1, 'engine_token_id' => 6, 'name' => 'Claude']);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->assertUnauthenticated($this->json($method, $uri, ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer 6|pAnelMintedS3cretOf40CharactersXXXXXXXXXX']));
    }

    public function test_the_bearer_is_never_logged_or_a_rate_limit_key(): void
    {
        $logged = [];
        Event::listen(MessageLogged::class, static function (MessageLogged $event) use (&$logged): void {
            $logged[] = $event->message.' '.json_encode(array_map(
                static fn (mixed $value): mixed => $value instanceof \Throwable ? (string) $value : $value,
                $event->context,
            ));
        });
        $bearer = $this->ownedMcpBearer(6);

        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer '.$bearer])->assertOk();
        // CA: packages/client-area/src/views/connect-ai/ConnectAi.vue:150
        $this->postJson('/mcp', ['jsonrpc' => '2.0'], ['Authorization' => 'Bearer 99|refused-secret-value'])->assertUnauthorized();

        $this->assertStringNotContainsString('pAnelMintedS3cret', implode("\n", $logged));
        $this->assertStringNotContainsString('refused-secret-value', implode("\n", $logged));

        // The limiter keys on the token id and a digest, never the raw bearer.
        $limiter = RateLimiter::limiter('mcp');
        $this->assertNotNull($limiter);
        $request = Request::create('/mcp', 'POST', server: ['HTTP_AUTHORIZATION' => 'Bearer '.$bearer, 'REMOTE_ADDR' => TestNetwork::public(9)]);
        $keys = array_map(static fn ($limit): string => (string) $limit->key, (array) $limiter($request));
        $this->assertSame(['mcp-ip:'.TestNetwork::public(9), 'mcp-token:6:'.hash('sha256', $bearer)], $keys);
        $this->assertSame(6, McpGate::tokenId($bearer));
    }

    private function assertUnauthenticated(\Illuminate\Testing\TestResponse $response): void
    {
        $response->assertUnauthorized();
        $this->assertSame(['message' => 'Unauthenticated.'], $response->json());
        $this->assertSame('Bearer', $response->headers->get('WWW-Authenticate'));
        Http::assertNothingSent();
    }
}
