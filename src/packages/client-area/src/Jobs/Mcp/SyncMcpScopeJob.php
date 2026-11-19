<?php

namespace PanelAlpha\ClientArea\Jobs\Mcp;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use PanelAlpha\ClientArea\Mcp\McpScopeSynchronizer;
use PanelAlpha\EngineClient\Exceptions\EngineException;

/**
 * Pushes one user's project scope to their Connect AI tokens on the Engine
 * (`McpScopeSynchronizer::apply()`).
 *
 * Unique per user until it starts, so a burst of triggers (a sync that
 * mirrors many new projects) queues one run, and a trigger that arrives while
 * it runs queues the next one. An Engine hiccup (down, 5xx, a breaker that is
 * open) releases the job with backoff; after the last attempt it is reported
 * and the job ends without landing in `failed_jobs` – the next real sync
 * (`EngineProjectsSynced`) queues the user again. A refusal (422) is reported
 * by the synchronizer and never retried.
 *
 * Internal job: no user waits on it, so it sends no notification and has no
 * `failed()`.
 */
final class SyncMcpScopeJob implements ShouldQueue, ShouldBeUniqueUntilProcessing
{
    use Dispatchable, InteractsWithQueue, Queueable;

    /** Attempts before an Engine hiccup is reported and the run ends. */
    public const TRIES = 5;

    /** Release delays between the attempts, in seconds. */
    public const BACKOFF_SECONDS = [10, 30, 60, 120];

    public int $tries = self::TRIES;

    /** An unexpected (non-Engine) exception fails the job at once. */
    public int $maxExceptions = 1;

    public int $timeout = 60;

    /** A lost job row must not block the user's next sync forever. */
    public int $uniqueFor = 600;

    public function __construct(public readonly int $userId)
    {
        $this->onQueue('default');
    }

    public function uniqueId(): string
    {
        return 'client-area:mcp-scope:'.$this->userId;
    }

    public function handle(McpScopeSynchronizer $synchronizer): void
    {
        try {
            $synchronizer->apply($this->userId);
        } catch (EngineException $e) {
            $attempt = $this->attempts();
            if ($attempt >= self::TRIES) {
                report($e);

                return;
            }

            $this->release(self::BACKOFF_SECONDS[max(0, min($attempt, count(self::BACKOFF_SECONDS)) - 1)]);
        }
    }
}
