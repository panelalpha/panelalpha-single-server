<?php

namespace PanelAlpha\Hub\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use PanelAlpha\Hub\HubClient;
use PanelAlpha\Hub\HubPairing;
use Throwable;

/**
 * The signed status report to PanelAlpha Hub, every five minutes (old
 * `hub:report`, Console/Kernel.php:111). A no-op while the panel is not
 * paired; the Hub's 401 forgets the pairing.
 */
final class HubReportCommand extends Command
{
    protected $signature = 'hub:report';

    protected $description = 'Send the signed status report to PanelAlpha Hub when the panel is connected';

    public function handle(HubClient $hub, HubPairing $pairing): int
    {
        if (! $pairing->isPaired()) {
            $this->info('Not connected to PanelAlpha.');

            return self::SUCCESS;
        }

        try {
            $response = $hub->report();
        } catch (Throwable $e) {
            // The class only: a transport message may carry the request URL.
            Log::warning('PanelAlpha Hub report failed', ['exception' => $e::class]);

            return self::FAILURE;
        }

        if ($response->status() === 401) {
            $this->warn('PanelAlpha no longer knows this panel, the connection was removed.');

            return self::SUCCESS;
        }
        if ($response->successful()) {
            $this->info("Report sent, PanelAlpha answered {$response->status()}.");

            return self::SUCCESS;
        }

        // Never the body or the headers: they hold the signature.
        Log::warning('PanelAlpha Hub rejected the report', [
            'status' => $response->status(),
            'error' => is_string($response->json('error')) ? $response->json('error') : '',
        ]);
        $this->info("Report sent, PanelAlpha answered {$response->status()}.");

        return self::FAILURE;
    }
}
