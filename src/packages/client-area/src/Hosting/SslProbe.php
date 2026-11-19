<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Panel-side reachability probe
 * (`services/{id}/domains/resolve`): an HTTPS GET to `https://<domain>/` with
 * `CURLOPT_RESOLVE` set to the project IP, as the old panel did. Pure HTTP, no
 * Engine call and no edition knowledge. Certificates are not probed here: the
 * certificate routes read the Engine's installed certificate and its verdict
 * ({@see DomainProbe}).
 *
 * Own-domain callers pass the project's own public IP and never the HostGuard:
 * on single-server the sites share the Engine's IP, which the guard blocks.
 *
 * Permanent panel code: every certificate read goes through the Engine's
 * `ssl-check` and the reachability probe stays panel-side, so it moved from
 * client-area-legacy into the controller.
 */
final class SslProbe implements PinnedProbe
{
    public function httpsStatus(string $host, string $address): ?int
    {
        if ($host === '' || $address === '') {
            return null;
        }

        try {
            $response = Http::withOptions(self::pinOptions($host, $address))
                ->timeout(5)
                ->get('https://'.$host.'/');
        } catch (ConnectionException $e) {
            report($e);

            return null;
        }

        return $response->status();
    }

    /**
     * The Guzzle options that pin an HTTPS GET to one resolved address: curl
     * skips DNS for that host and the response is never followed to an
     * unchecked host. An IPv6 literal is bracketed (curl's `CURLOPT_RESOLVE`
     * syntax). Also the old panel's `verify=false` – the probe only checks that
     * the domain answers.
     *
     * @return array<string, mixed>
     */
    public static function pinOptions(string $host, string $address): array
    {
        return [
            'allow_redirects' => false,
            'verify' => false,
            'curl' => [CURLOPT_RESOLVE => ["{$host}:443:".self::endpoint($address)]],
        ];
    }

    /**
     * The stream-URI host for an address: an IPv6 literal must be bracketed.
     */
    public static function endpoint(string $address): string
    {
        return str_contains($address, ':') ? '['.$address.']' : $address;
    }
}
