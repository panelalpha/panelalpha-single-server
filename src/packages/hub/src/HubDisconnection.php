<?php

namespace PanelAlpha\Hub;

use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Disconnects the panel from PanelAlpha Hub: the signed disconnect, then the
 * pairing is forgotten whatever the Hub answers (the Hub drops a pairing it no
 * longer hears from anyway).
 */
final class HubDisconnection
{
    public function __construct(
        private readonly HubClient $hub,
        private readonly HubPairing $pairing,
    ) {}

    /**
     * @return bool false when the panel was not paired
     */
    public function run(): bool
    {
        if (! $this->pairing->isPaired()) {
            return false;
        }

        try {
            $this->hub->disconnect();
        } catch (Throwable $e) {
            // The class only: a transport message may carry the request URL.
            Log::warning('PanelAlpha Hub disconnect failed', ['exception' => $e::class]);
        }
        $this->pairing->forget();

        return true;
    }
}
