<?php

namespace PanelAlpha\ClientArea\Mcp;

use Illuminate\Database\Eloquent\Model;
use PanelAlpha\ClientArea\Contracts\PanelUser;
use PanelAlpha\ClientArea\Jobs\Mcp\SyncMcpScopeJob;
use PanelAlpha\ClientArea\Models\McpToken;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\McpApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;

/**
 * Keeps each Connect AI token's Engine scope equal to its owner's projects
 *The Engine fixes a token's scope when it is
 * minted (`McpTokenController::store`), so a project created, cloned, staged,
 * linked, deleted or unlinked later must be pushed with
 * `PUT /mcp-tokens/{id}/projects`.
 *
 * The work runs in `SyncMcpScopeJob` (queued, unique per user, retried on an
 * Engine hiccup) – never inline in a request. It is dispatched:
 * - after `EngineProjectsSynced`, for every user who owns a token on that Engine;
 * - after `ProjectMirrored` for a new row (a project created, cloned or staged);
 * - after `ProjectsUnmirrored` (a project deleted, or gone from the Engine);
 * - by an edition, through `syncUser()`, when it links or unlinks a user and a
 *   project.
 */
final class McpScopeSynchronizer
{
    public function __construct(
        private readonly EngineResolver $engines,
        private readonly McpProjectScope $scope,
        private readonly EngineHealth $health,
    ) {}

    /**
     * Queue a scope sync for one user. Editions call this when they link or
     * unlink a user and a project; it never calls the Engine itself.
     */
    public function syncUser(PanelUser $user): void
    {
        $userId = Payload::int($user->getAuthIdentifier());
        if ($userId !== null) {
            self::queue($userId);
        }
    }

    /**
     * Queue a scope sync for every user who owns a token, on one Engine or (null)
     * on any Engine.
     */
    public function syncOwners(?int $engineId = null): void
    {
        $owners = McpToken::query()
            ->when($engineId !== null, static fn ($query) => $query->where('engine_id', $engineId))
            ->distinct()
            ->orderBy('user_id')
            ->pluck('user_id');

        foreach ($owners as $userId) {
            $userId = Payload::int($userId);
            if ($userId !== null) {
                self::queue($userId);
            }
        }
    }

    /**
     * Compare every owned, non-revoked token of the user with the user's scope
     * and `PUT` the scope only where they differ. One `GET /mcp-tokens` per
     * Engine the user owns tokens on.
     *
     * Each Engine is synced on its own: a down or failing
     * Engine does not keep the user's tokens on the other Engines stale; the
     * first failure is rethrown once every Engine was tried, so the job retries.
     *
     * @throws EngineException when an Engine is down or failed (the job retries)
     */
    public function apply(int $userId): void
    {
        $user = $this->user($userId);
        if ($user === null) {
            // The rows cascade with the user; nothing is left to scope.
            return;
        }

        $engineIds = McpToken::query()
            ->where('user_id', $userId)
            ->distinct()
            ->orderBy('engine_id')
            ->pluck('engine_id');

        $failure = null;
        foreach ($engineIds as $engineId) {
            $engineId = Payload::int($engineId);
            if ($engineId === null) {
                continue;
            }

            try {
                $this->applyOn($user, $userId, $engineId);
            } catch (EngineException $e) {
                $failure ??= $e;
            }
        }

        if ($failure !== null) {
            throw $failure;
        }
    }

    /**
     * @throws EngineException
     */
    private function applyOn(PanelUser $user, int $userId, int $engineId): void
    {
        // A down Engine is not called; the job retries later.
        if ($this->health->isDown($engineId)) {
            throw new EngineUnavailableException("Engine #{$engineId} is down; the MCP scope sync waits.");
        }

        $owned = McpToken::query()
            ->where('user_id', $userId)
            ->where('engine_id', $engineId)
            ->pluck('engine_token_id')
            ->map(static fn (mixed $id): ?int => Payload::int($id))
            ->all();

        $api = new McpApi($this->engines->forEngine($engineId));
        $scope = null;

        foreach ($api->tokens() as $token) {
            $tokenId = Payload::int($token['id'] ?? null);
            if ($tokenId === null || ! in_array($tokenId, $owned, true)) {
                continue;
            }
            // A revoked token reaches nothing; its scope is left alone.
            if (($token['revoked_at'] ?? null) !== null) {
                continue;
            }

            $scope ??= $this->scope->for($user, $engineId);
            if ($this->scopeOf($token) === $scope) {
                continue;
            }

            try {
                $api->setTokenProjects($tokenId, $scope);
            } catch (EngineValidationException $e) {
                // A refusal is not a hiccup: retrying cannot change it. Report it
                // and keep the other tokens in sync.
                report($e);
            } catch (EngineRequestException $e) {
                // Deleted on the Engine since the list was read.
                if ($e->engineStatus !== 404) {
                    throw $e;
                }
            }
        }
    }

    /**
     * The token's current scope, sorted like `McpProjectScope`; null for an
     * unscoped token (the Engine's `projects: null`), which never matches.
     *
     * @param  array<string, mixed>  $token
     * @return list<string>|null
     */
    private function scopeOf(array $token): ?array
    {
        $projects = $token['projects'] ?? null;
        if (! is_array($projects)) {
            return null;
        }

        $names = Payload::strings($projects);
        $names = array_values(array_unique($names));
        sort($names, SORT_STRING);

        return $names;
    }

    private function user(int $userId): ?PanelUser
    {
        /** @var class-string<Model> $model */
        $model = config('auth.providers.users.model');
        $user = $model::query()->find($userId);

        return $user instanceof PanelUser ? $user : null;
    }

    private static function queue(int $userId): void
    {
        // On the database queue: never inline in the request
        // or the sync that triggered it.
        SyncMcpScopeJob::dispatch($userId)->onConnection('database');
    }
}
