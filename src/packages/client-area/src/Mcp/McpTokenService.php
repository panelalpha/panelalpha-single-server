<?php

namespace PanelAlpha\ClientArea\Mcp;

use Illuminate\Contracts\Container\Container;
use Illuminate\Pagination\LengthAwarePaginator;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Contracts\PanelUser;
use PanelAlpha\ClientArea\Models\McpToken;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\SelfProject;
use PanelAlpha\EngineClient\Api\McpApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use Illuminate\Database\Eloquent\Builder;
use Throwable;

/**
 * Connect AI tokens per user. The Engine mints every
 * MCP token for its root admin; the panel records which user owns each one it
 * minted (`McpToken`) and shows, revokes and deletes only those. A token
 * without a row is not a Connect AI token.
 *
 * The response bodies stay the Engine's token objects, as before (the CA reads
 * them like the Engine's: `McpTokensSection.vue:231`,
 * `McpTokenCreateModal.vue:144`). The plain-text token in the create answer is
 * handed to the user once and never stored or logged (only its SHA-256
 * digest, so the `/mcp` gatekeeper can tell two Engines' equal ids apart).
 *
 * Multi: an Engine scopes a token to its own projects, so a
 * token reaches one Engine – the user's token Engine ({@see engineFor()}).
 * The list reads every Engine the user has live tokens on; revoke and delete
 * reach the token's own Engine. Community and Pro have one Engine: unchanged.
 */
final class McpTokenService
{
    /** Name prefix of the panel's own Engine API token (`system:api-access`). */
    public const PANEL_TOKEN_PREFIX = 'api-access:';

    /** The Engine's activity page size (`McpActivityLogController::index`, `paginate(20)`). */
    public const ACTIVITY_PER_PAGE = 20;

    public function __construct(
        private readonly EngineResolver $engines,
        private readonly McpProjectScope $scope,
        private readonly Container $container,
        private readonly ApplicationRepository $applications,
        private readonly EngineHealth $health,
    ) {}

    /**
     * The Engine a user's new token goes to: the Engine of
     * the user's newest live token, else the Engine hosting most of the user's
     * projects (ties: the lower id), else the default Engine. One Engine (Community,
     * Pro): always that one, without a query.
     */
    public function engineFor(PanelUser $user): int
    {
        $known = $this->engines->engineIds();
        if (count($known) <= 1) {
            return $this->engines->defaultEngineId();
        }

        $newest = Payload::int(McpToken::query()
            ->where('user_id', $user->getAuthIdentifier())
            ->orderByDesc('id')
            ->value('engine_id'));
        if ($newest !== null && in_array($newest, $known, true)) {
            return $newest;
        }

        $counts = [];
        foreach ($this->applications->forUser($user, refresh: false) as $application) {
            $engineId = Payload::int($application->engine_id);
            $username = Payload::nullableString($application->engine_username);
            if ($engineId === null || ! in_array($engineId, $known, true) || ($username !== null && SelfProject::matches($username))) {
                continue;
            }
            $counts[$engineId] = ($counts[$engineId] ?? 0) + 1;
        }
        if ($counts !== []) {
            $max = max($counts);
            $candidates = array_keys(array_filter($counts, static fn (int $count): bool => $count === $max));
            sort($candidates);

            return $candidates[0];
        }

        return $this->engines->defaultEngineId();
    }

    /**
     * The SHA-256 digest of a plain-text token (the gatekeeper's tie-break),
     * or null when there is none.
     */
    public static function digest(mixed $plainTextToken): ?string
    {
        $token = Payload::nullableString($plainTextToken);

        return $token === null || $token === '' ? null : hash('sha256', $token);
    }

    /**
     * Mint a token scoped to every project of the user and record it. When the
     * row cannot be recorded, the Engine token is deleted again, so no token
     * exists that nobody owns.
     *
     * @return array<string, mixed> the Engine's token object, `plain_text_token` included
     */
    public function mint(PanelUser $user, string $name): array
    {
        $engineId = $this->engineFor($user);
        $api = $this->api($engineId);

        $token = $api->createToken($name, $this->scope->for($user, $engineId));
        $tokenId = Payload::int($token['id'] ?? null);

        try {
            if ($tokenId === null) {
                throw new \UnexpectedValueException('The Engine answered a minted MCP token without an id.');
            }

            McpToken::query()->create([
                'user_id' => $user->getAuthIdentifier(),
                'engine_id' => $engineId,
                'engine_token_id' => $tokenId,
                'name' => $name,
                'token_digest' => self::digest($token['plain_text_token'] ?? null),
            ]);
        } catch (Throwable $e) {
            if ($tokenId !== null) {
                $this->discard($api, $tokenId);
            }

            throw $e;
        }

        return $token;
    }

    /**
     * The user's tokens, in the Engine's order (Engine by Engine in Multi). The
     * Engine list is read once per Engine; a row whose Engine token no longer
     * exists is soft-deleted (its calls stay in the user's activity log).
     *
     * Multi: every Engine the user has live tokens on, and the
     * token Engine. With more than one, an Engine whose breaker is open or whose
     * list fails is left out (its rows are kept); only when none answers is the
     * first failure raised.
     *
     * @return list<array<string, mixed>>
     */
    public function tokensOf(PanelUser $user): array
    {
        $engineIds = $this->tokenEngines($user);
        if (count($engineIds) === 1) {
            return $this->tokensOn($user, $engineIds[0]);
        }

        $tokens = [];
        $failure = null;
        $answered = false;
        foreach ($engineIds as $engineId) {
            if ($this->health->isDown($engineId)) {
                $failure ??= new EngineUnavailableException("Engine #{$engineId} is down; its Connect AI tokens are left out.");
                continue;
            }

            try {
                $tokens = [...$tokens, ...$this->tokensOn($user, $engineId)];
                $answered = true;
            } catch (EngineException $e) {
                report($e);
                $failure ??= $e;
            }
        }

        if (! $answered && $failure !== null) {
            throw $failure;
        }

        return $tokens;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function tokensOn(PanelUser $user, int $engineId): array
    {
        $tokens = $this->api($engineId)->tokens();

        $existing = [];
        foreach ($tokens as $token) {
            $id = Payload::int($token['id'] ?? null);
            if ($id !== null) {
                $existing[] = $id;
            }
        }

        $this->owned($user, $engineId)->whereNotIn('engine_token_id', $existing)->delete();

        $owned = array_map(
            static fn (mixed $id): ?int => Payload::int($id),
            $this->owned($user, $engineId)->pluck('engine_token_id')->all(),
        );

        return array_values(array_filter(
            $tokens,
            static fn (array $token): bool => in_array(Payload::int($token['id'] ?? null), $owned, true),
        ));
    }

    /**
     * The Engines whose tokens the user's list shows: the token Engine and
     * every Engine the user has a live token on, in id order.
     *
     * @return non-empty-list<int>
     */
    private function tokenEngines(PanelUser $user): array
    {
        $known = $this->engines->engineIds();
        $engineIds = [$this->engineFor($user)];
        foreach (McpToken::query()->where('user_id', $user->getAuthIdentifier())->distinct()->pluck('engine_id') as $engineId) {
            $engineId = Payload::int($engineId);
            if ($engineId !== null && in_array($engineId, $known, true)) {
                $engineIds[] = $engineId;
            }
        }
        $engineIds = array_values(array_unique($engineIds));
        sort($engineIds);

        return $engineIds;
    }

    /**
     * @return array<string, mixed> the Engine's revoked token object
     */
    public function revoke(PanelUser $user, int $tokenId): array
    {
        // A token the user does not own is a 404 before any Engine call; the
        // token's own Engine answers.
        $row = $this->find($user, $tokenId);

        return $this->api($row->engine_id)->revokeToken($tokenId);
    }

    /**
     * @return array<string, mixed> the Engine's `{id}`
     */
    public function delete(PanelUser $user, int $tokenId): array
    {
        // A token the user does not own is a 404 before any Engine call; the
        // token's own Engine answers.
        $row = $this->find($user, $tokenId);

        $deleted = $this->api($row->engine_id)->deleteToken($tokenId);
        // Soft delete: the Engine keeps the deleted token's id on its calls,
        // so the user's activity log still shows them.
        $row->delete();

        return $deleted;
    }

    /**
     * Revoke every token the user owns, on every Engine – for a user who may no
     * longer reach any project (the Admin Area's archive). Revoking, not only
     * narrowing the scope to no project (which the Engine accepts):
     * an archived user's assistant must stop working at all. The rows stay, so
     * {@see deleteAllOf()} finds them; a token already gone from the Engine is
     * skipped.
     *
     * @throws EngineException when an Engine cannot revoke a token
     */
    public function revokeAllOf(PanelUser $user): void
    {
        foreach (McpToken::query()->where('user_id', $user->getAuthIdentifier())->get() as $row) {
            try {
                $this->api($row->engine_id)->revokeToken($row->engine_token_id);
            } catch (EngineRequestException $e) {
                if ($e->engineStatus !== 404) {
                    throw $e;
                }
            }
        }
    }

    /**
     * Delete every token the user owns from its Engine and the panel, before
     * the user row goes (the rows would cascade, the Engine tokens would not).
     *
     * @throws EngineException when an Engine cannot delete a token
     */
    public function deleteAllOf(PanelUser $user): void
    {
        foreach (McpToken::query()->where('user_id', $user->getAuthIdentifier())->get() as $row) {
            try {
                $this->api($row->engine_id)->deleteToken($row->engine_token_id);
            } catch (EngineRequestException $e) {
                if ($e->engineStatus !== 404) {
                    throw $e;
                }
            }
            // The user row goes next: nothing is left to show the calls to.
            $row->forceDelete();
        }
    }

    /**
     * Adopt an Engine MCP token minted before tokens were per user: rescope it
     * to the user's projects, then record the ownership. Never automatic – an
     * unowned token may be the Engine operator's own server-wide token, and
     * rescoping it would break that assistant – so only the operator's command
     * calls this.
     *
     * The scope is pushed first: a recorded but still unscoped token would pass
     * the `/mcp` gatekeeper with every project in reach. If the Engine refuses the
     * scope, nothing is recorded.
     *
     * The token is on `$engineId` (default: the default Engine; Multi names
     * the Engine).
     *
     * @return array<string, mixed> the Engine's rescoped token object
     *
     * @throws McpTokenAdoptionRefused
     * @throws EngineException when the Engine cannot be read or refuses the scope
     * @throws EngineValidationException when the Engine refuses the scope (a project it no longer has)
     */
    public function adopt(PanelUser $user, int $tokenId, ?int $engineId = null): array
    {
        $engineId ??= $this->engines->defaultEngineId();

        if (McpToken::query()->where('engine_id', $engineId)->where('engine_token_id', $tokenId)->exists()) {
            throw new McpTokenAdoptionRefused("Engine MCP token {$tokenId} is already a Connect AI token.");
        }

        $api = $this->api($engineId);
        $token = null;
        foreach ($api->tokens() as $candidate) {
            if (Payload::int($candidate['id'] ?? null) === $tokenId) {
                $token = $candidate;
                break;
            }
        }
        if ($token === null) {
            throw new McpTokenAdoptionRefused("Engine MCP token {$tokenId} does not exist.");
        }

        // The panel's own Engine API token is never a Connect AI token.
        $name = Payload::string($token['name'] ?? '');
        if (str_starts_with($name, self::PANEL_TOKEN_PREFIX)) {
            throw new McpTokenAdoptionRefused("Engine MCP token {$tokenId} is the panel's own API token.");
        }

        $rescoped = $api->setTokenProjects($tokenId, $this->scope->for($user, $engineId));

        McpToken::query()->create([
            'user_id' => $user->getAuthIdentifier(),
            'engine_id' => $engineId,
            'engine_token_id' => $tokenId,
            'name' => $name,
        ]);

        return $rescoped;
    }

    /**
     * The Connect AI activity log the user may see, as the Engine's bare
     * paginator (the CA reads `data` and `total`, `McpActivityLog.vue:251-252`).
     *
     * In single-user mode one user owns every Connect AI token, so the Engine's
     * whole log is theirs. Otherwise the log is filtered
     * to the user's tokens with `token_ids[]` (Engine 2.2.0), deleted
     * tokens included – the Engine keeps a deleted token's id on its calls. A
     * user who never had a token gets an empty page of the same shape without
     * an Engine call.
     *
     * The log is the token Engine's: Community and Pro have one
     * Engine; in Multi the calls of tokens on another Engine (after an adoption
     * there) are not merged in.
     *
     * @param  array<string, mixed>  $query  the CA's `token_name` / `page`
     * @return array<string, mixed>
     */
    public function activityLog(PanelUser $user, array $query, string $path): array
    {
        $engineId = $this->engineFor($user);
        if (SingleUserMode::active($this->container)) {
            return $this->api($engineId)->activityLogs($query);
        }

        $owned = array_values(array_filter(
            array_map(static fn (mixed $id): ?int => Payload::int($id), $this->owned($user, $engineId)->withTrashed()->pluck('engine_token_id')->all()),
            static fn (?int $id): bool => $id !== null,
        ));
        if ($owned !== []) {
            return $this->api($engineId)->activityLogs([...$query, 'token_ids' => $owned]);
        }

        $page = Payload::int($query['page'] ?? null) ?? 1;

        return Payload::object((new LengthAwarePaginator([], 0, self::ACTIVITY_PER_PAGE, $page, ['path' => $path]))->toArray());
    }

    /**
     * @return Builder<McpToken>
     */
    private function owned(PanelUser $user, int $engineId): Builder
    {
        return McpToken::query()
            ->where('user_id', $user->getAuthIdentifier())
            ->where('engine_id', $engineId);
    }

    /**
     * The user's live token with this Engine id on a known Engine; when two of
     * the user's Engines gave the same id (Multi), the newest.
     */
    private function find(PanelUser $user, int $tokenId): McpToken
    {
        return McpToken::query()
            ->where('user_id', $user->getAuthIdentifier())
            ->whereIn('engine_id', $this->engines->engineIds())
            ->where('engine_token_id', $tokenId)
            ->orderByDesc('id')
            ->firstOrFail();
    }

    /**
     * Best effort: the recording failure is what the caller rethrows; a failed
     * delete is reported, never swallowed silently.
     */
    private function discard(McpApi $api, int $tokenId): void
    {
        try {
            $api->deleteToken($tokenId);
        } catch (Throwable $e) {
            report($e);
        }
    }

    private function api(int $engineId): McpApi
    {
        return new McpApi($this->engines->forEngine($engineId));
    }
}
