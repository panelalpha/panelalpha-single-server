<?php

namespace PanelAlpha\ClientArea\Hosting;

/**
 * A panel-side probe of a user-supplied host, pinned to an address that was
 * resolved once. Injected so tests can fake it and never
 * resolve a name or open a socket. The real implementation is {@see SslProbe}.
 *
 * Permanent panel code: every certificate read goes through the Engine's
 * `ssl-check` and the reachability probe stays panel-side, so it moved from
 * client-area-legacy into the controller.
 */
interface PinnedProbe
{
    /**
     * HTTPS GET `https://<host>/` pinned to `$address` with SNI = the host and
     * no redirect following (old `DomainController::resolve` used
     * `CURLOPT_RESOLVE` plus `$response->successful()`). Returns the status
     * code, or null when nothing answered.
     */
    public function httpsStatus(string $host, string $address): ?int;
}
