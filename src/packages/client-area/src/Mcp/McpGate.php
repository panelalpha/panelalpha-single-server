<?php

namespace PanelAlpha\ClientArea\Mcp;

use Illuminate\Database\Eloquent\Model;
use PanelAlpha\ClientArea\Models\McpToken;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Contracts\EngineResolver;

/**
 * The `/mcp` gatekeeper: the panel forwards an MCP
 * request to the Engine only for a token it minted for a user who still
 * exists. Everything else is refused before any Engine call.
 *
 * The bearer must be a Sanctum plain-text token `<id>|<secret>` (the Engine's
 * tokens are Sanctum personal access tokens); `<id>` must be an
 * `mcp_tokens.engine_token_id`, and the row's user must exist. The row names
 * the Engine the request goes to ({@see engineFor()}). The Engine still checks the secret, revocation and
 * the project scope. The bearer is never logged or stored; the rate limiter
 * keys on the token id and a digest of the bearer (`limiterKey()`).
 */
final class McpGate
{
    public function __construct(private readonly EngineResolver $engines) {}

    /** `<id>|<secret>`: a positive id that fits a BIGINT and a secret without whitespace. */
    private const PLAIN_TEXT_TOKEN = '/^([1-9][0-9]{0,17})\|(\S{1,255})$/';

    /**
     * The Engine token id of a well-formed Sanctum plain-text token, or null.
     */
    public static function tokenId(?string $bearer): ?int
    {
        if ($bearer === null || preg_match(self::PLAIN_TEXT_TOKEN, $bearer, $match) !== 1) {
            return null;
        }

        return (int) $match[1];
    }

    /**
     * The per-token rate-limit key: the token id plus a SHA-256 digest of the
     * whole bearer, so the raw token never becomes a cache key, and a caller who
     * knows another user's token id (ids are sequential) cannot drain that
     * token's bucket with made-up secrets. Null for a malformed bearer (the IP
     * limit still applies).
     */
    public static function limiterKey(?string $bearer): ?string
    {
        $tokenId = self::tokenId($bearer);

        return $tokenId === null ? null : 'mcp-token:'.$tokenId.':'.hash('sha256', (string) $bearer);
    }

    /**
     * Whether the request may be forwarded to this Engine.
     */
    public function admits(?string $bearer, int $engineId): bool
    {
        return $this->engineFor($bearer) === $engineId;
    }

    /**
     * The Engine a bearer's request goes to, or null when the panel must refuse
     * it. The token id names the row; each Engine numbers its
     * tokens itself, so when two Engines gave the same id (Multi) the row whose
     * stored digest is the bearer's wins, else the one row without a digest (an
     * adopted token). Community and Pro have one Engine: one row at most.
     */
    public function engineFor(?string $bearer): ?int
    {
        $tokenId = self::tokenId($bearer);
        if ($tokenId === null) {
            return null;
        }

        // A row of an Engine this panel does not know is never forwarded.
        $rows = McpToken::query()
            ->where('engine_token_id', $tokenId)
            ->whereIn('engine_id', $this->engines->engineIds())
            ->orderBy('id')
            ->get();
        if ($rows->isEmpty()) {
            return null;
        }

        // The FK cascades, but the owner is checked anyway: a token of a
        // removed user must never reach the Engine through the panel.
        /** @var class-string<Model> $model */
        $model = config('auth.providers.users.model');
        $existing = array_map(
            static fn (mixed $id): ?int => Payload::int($id),
            $model::query()->whereKey($rows->pluck('user_id')->all())->pluck((new $model)->getKeyName())->all(),
        );
        $rows = $rows->filter(static fn (McpToken $row): bool => in_array($row->user_id, $existing, true))->values();

        if ($rows->count() === 1) {
            return $rows->first()?->engine_id;
        }

        $digest = hash('sha256', (string) $bearer);
        $match = $rows->first(static fn (McpToken $row): bool => $row->token_digest !== null && hash_equals($row->token_digest, $digest));
        if ($match instanceof McpToken) {
            return $match->engine_id;
        }

        $undigested = $rows->filter(static fn (McpToken $row): bool => $row->token_digest === null);

        return $undigested->count() === 1 ? $undigested->first()?->engine_id : null;
    }
}
