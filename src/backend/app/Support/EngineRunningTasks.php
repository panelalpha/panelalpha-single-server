<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\TasksApi;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Whether the Engine has a queued or running task, for the Client Area's
 * admin-area menu badge (`single_server.has_running_tasks`).
 *
 * `/home` must never call the Engine, so it reads this
 * cache only; the scheduler refreshes it from `GET /tasks`. A refresh that
 * cannot reach the Engine records "not running" so the badge goes off rather
 * than sticking on a stale value. The Engine call goes through
 * the package `TasksApi`/`EngineResolver`, never a hand-built Engine client.
 */
final class EngineRunningTasks
{
    /**
     * How long a cached answer counts as fresh. The badge is only advisory, so
     * the scheduler does not re-ask the Engine more than once a minute.
     */
    private const TTL_SECONDS = 30;

    public function __construct(private readonly EngineResolver $engines) {}

    /**
     * Read only the cache – `/home` must never call the Engine. A missing,
     * failed or malformed entry answers false.
     */
    public function get(): bool
    {
        try {
            $engineId = $this->engines->forEngine(EngineConnection::DEFAULT_ID)->connection()->id;
        } catch (EngineException) {
            return false;
        }

        $cached = self::decodeObject(Cache::get($this->key($engineId)));
        if ($cached === null || ($cached['ok'] ?? null) !== true) {
            return false;
        }

        return ($cached['running'] ?? null) === true;
    }

    /**
     * Refresh the cache from the Engine (scheduler only). A value younger than
     * the window is not fetched again; a failed refresh records "not running"
     * (the Engine-down answer).
     */
    public function refresh(): void
    {
        try {
            $client = $this->engines->forEngine(EngineConnection::DEFAULT_ID);
        } catch (EngineException) {
            return;
        }

        $key = $this->key($client->connection()->id);
        $cached = self::decodeObject(Cache::get($key));
        if ($cached !== null
            && is_numeric($cached['fetched_at'] ?? null)
            && now()->getTimestamp() - (int) $cached['fetched_at'] < self::TTL_SECONDS
        ) {
            return;
        }

        try {
            $running = (new TasksApi($client))->hasActiveTasks();
        } catch (EngineException $e) {
            report($e);
            Cache::forever($key, ['ok' => false, 'fetched_at' => now()->getTimestamp()]);

            return;
        }

        Cache::forever($key, [
            'running' => $running,
            'ok' => true,
            'fetched_at' => now()->getTimestamp(),
        ]);
    }

    private function key(int $engineId): string
    {
        return 'host:engine-running-tasks:'.$engineId;
    }

    /**
     * A cache value narrowed to an array (the stored shape), or null.
     *
     * @return array<string, mixed>|null
     */
    private static function decodeObject(mixed $value): ?array
    {
        return is_array($value) ? Payload::object($value) : null;
    }
}
