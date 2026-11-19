<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Validation\ValidationException;

/**
 * Guards outbound requests to user-controlled hosts (git URLs sent to the
 * Engine, panel-side TLS/HTTP probes) against SSRF.
 *
 * Injected so tests can fake it and never resolve a name or open a socket.
 */
interface HostGuard
{
    /**
     * The panel's refusal of a host it must not contact, under the `host`
     * field. The Engine's own refusal of an internal address (422
     * `problems[].code: host_refused`) is answered with the same text
     * (`Support\EngineErrors`).
     */
    public const string REFUSAL = 'The host cannot be reached from the panel.';

    /**
     * @throws ValidationException when the host must not be contacted
     */
    public function assertAllowed(string $host): void;

    public function allows(string $host): bool;

    /**
     * Resolve the host once and return only the addresses a probe may connect
     * to. The caller pins its connection to one of them, so
     * no second lookup opens a rebinding window.
     *
     * @return list<string>
     *
     * @throws ValidationException when the name does not resolve or any address is blocked
     */
    public function validatedAddresses(string $host): array;
}
