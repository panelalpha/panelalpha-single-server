<?php

namespace PanelAlpha\ClientArea\Access;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Collection;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;

/**
 * Community: the single user sees every project on the single Engine.
 *
 * The user argument is intentionally unused – there is no ownership table in
 * Community. Reads refresh the local mirror when it is older than
 * config('client-area.sync_ttl').
 */
final class SingleOwnerApplicationRepository implements ApplicationRepository
{
    public function __construct(private readonly ApplicationSynchronizer $synchronizer) {}

    public function forUser(Authenticatable $user, bool $refresh = true): Collection
    {
        if ($refresh) {
            $this->synchronizer->syncIfStale(EngineConnection::DEFAULT_ID);
        }

        return Application::query()
            ->where('engine_id', EngineConnection::DEFAULT_ID)
            ->excludingSelf()
            ->orderBy('id')
            ->get();
    }

    public function findForUser(Authenticatable $user, int $id): Application
    {
        $query = fn () => Application::query()->where('engine_id', EngineConnection::DEFAULT_ID)->whereKey($id)->excludingSelf();

        // A project created on the Engine a moment ago may not be mirrored yet.
        if (! $query()->exists()) {
            $this->synchronizer->syncIfStale(EngineConnection::DEFAULT_ID);
        }

        return $query()->firstOrFail();
    }

    public function domainsInUse(): array
    {
        // Global integrity check: every mirrored domain, regardless of owner
        //No Engine call – the mirror is the truth about what
        // the panel already handed out.
        $domains = [];
        foreach (Application::query()
            ->where('engine_id', EngineConnection::DEFAULT_ID)
            ->whereNotNull('domain')
            ->orderBy('id')
            ->pluck('domain') as $domain) {
            if (is_string($domain) && $domain !== '') {
                $domains[] = $domain;
            }
        }

        return $domains;
    }
}
