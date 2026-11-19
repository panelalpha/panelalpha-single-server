<?php

namespace PanelAlpha\Hub\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use PanelAlpha\Hub\HubClient;
use PanelAlpha\Hub\HubEvents;
use PanelAlpha\Hub\HubPairing;
use Throwable;

/**
 * Delivers the recorded monitoring events to PanelAlpha Hub (contract §6a),
 * every minute while the panel is paired, oldest first in batches of 200. An
 * event stays until the Hub took it; a batch the Hub refuses as invalid (422)
 * is dropped so it cannot hold back the ones after it.
 */
final class HubEventsCommand extends Command
{
    /** Batches per run: a long outage drains over a few minutes, not in one burst. */
    private const int MAX_BATCHES = 5;

    protected $signature = 'hub:events';

    protected $description = 'Send the recorded monitoring events to PanelAlpha Hub when the panel is connected';

    public function handle(HubClient $hub, HubPairing $pairing, HubEvents $events): int
    {
        if (! $pairing->isPaired()) {
            $events->pending();
            $this->info('Not connected to PanelAlpha.');

            return self::SUCCESS;
        }

        $sent = 0;
        for ($i = 0; $i < self::MAX_BATCHES; $i++) {
            $batch = $events->pending();
            if ($batch === []) {
                break;
            }

            try {
                $response = $hub->events(array_values($batch));
            } catch (Throwable $e) {
                // The class only: a transport message may carry the request URL.
                Log::warning('PanelAlpha Hub events failed', ['exception' => $e::class]);

                return self::FAILURE;
            }

            if ($response->status() === 401) {
                $events->pending();
                $this->warn('PanelAlpha no longer knows this panel, the connection was removed.');

                return self::SUCCESS;
            }
            if (! $response->successful() && $response->status() !== 422) {
                // Never the body or the headers: they hold the signature.
                Log::warning('PanelAlpha Hub rejected the events', [
                    'status' => $response->status(),
                    'error' => is_string($response->json('error')) ? $response->json('error') : '',
                ]);

                return self::FAILURE;
            }
            if ($response->status() === 422) {
                Log::warning('PanelAlpha Hub refused a batch of events, dropped', ['count' => count($batch)]);
            }

            $events->forget(array_keys($batch));
            $sent += count($batch);
        }

        $this->info("{$sent} event(s) sent.");

        return self::SUCCESS;
    }
}
