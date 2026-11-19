<?php

namespace PanelAlpha\EngineClient;

use Illuminate\Support\Facades\Cache;

/**
 * Per-Engine circuit breaker (the Engine-down policy for every fan-out).
 *
 * `EngineClient` opens it on a connect failure and closes it once the Engine
 * answers 2xx/4xx again; it also expires after {@see OPEN_SECONDS} so a recovered
 * Engine is retried without a restart. Fan-out schedulers skip the ids of a down
 * Engine and per-id jobs `release()` with backoff, so one unreachable Engine
 * costs one probe, not one doomed call per project.
 */
final class EngineHealth
{
    /** A connection error suppresses new calls for this long. */
    public const OPEN_SECONDS = 300;

    public function isDown(int $engineId): bool
    {
        $openedAt = Cache::get($this->key($engineId));

        if (! is_numeric($openedAt)) {
            return false;
        }

        if (now()->getTimestamp() - (int) $openedAt >= self::OPEN_SECONDS) {
            Cache::forget($this->key($engineId));

            return false;
        }

        return true;
    }

    public function open(int $engineId): void
    {
        Cache::forever($this->key($engineId), now()->getTimestamp());
    }

    public function close(int $engineId): void
    {
        // Nothing is open after the usual request: skip the cache write.
        if (Cache::has($this->key($engineId))) {
            Cache::forget($this->key($engineId));
        }
    }

    private function key(int $engineId): string
    {
        return 'user-application:engine:'.$engineId.':unavailable-since';
    }
}
