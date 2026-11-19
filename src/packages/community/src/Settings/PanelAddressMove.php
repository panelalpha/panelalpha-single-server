<?php

namespace PanelAlpha\Community\Settings;

use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\SelfProject;
use PanelAlpha\EngineClient\Api\DomainsApi;
use PanelAlpha\EngineClient\Api\SystemApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;

/**
 * Moves the panel to a new URL: the URL's host becomes the main domain of the
 * panel's own Engine project, answering HTTPS on the URL's port only, and the address the panel leaves is deleted,
 * so its name and port are free for another project.
 *
 * In the Engine's order, the old address answering until the last step: a new host is added as an addon domain
 * and gets its certificate (the server's own name keeps the Engine's); one `PUT` makes it the main domain on its
 * port, which redeploys the panel so APP_URL follows; then the old main domain, an addon by then, is deleted. The same host on another port is one `PUT` on
 * the main domain. Domains added by hand stay; the addon an older panel added for its URL goes too, and
 * so does the one a refused or failed move added itself.
 */
final class PanelAddressMove
{
    public const string NOT_CONFIGURED = 'The panel does not know its own Engine project, so the domain cannot be registered.';

    public const string SSL_FAILED = 'The SSL certificate could not be issued. Point the domain\'s DNS at this server and try again.';

    public const string ENGINE_FAILED = 'The Engine could not register the domain. Try again later.';

    public const string ENGINE_TOO_OLD = 'This Engine cannot move the panel to another address. Update the Engine, then try again.';

    public const string BUSY = 'The panel is being deployed or backed up. Save again once that has finished.';

    /**
     * `%s` is the panel's project. A panel installed as the README says has the permission; one installed before
     * gets it once on the server, as the Engine has no API for it.
     */
    public const string PORTS_NOT_ALLOWED = 'This server lets the panel answer on port 443 only: another port opens it in the server\'s firewall, which only the server\'s operator can allow. Keep 443, or allow it once on the server with `pae system:public-routing:allow %s --ports`.';

    /** `%1$s` is the host, `%2$s` the panel's project. */
    public const string HOST_NOT_ALLOWED = '%1$s is the server\'s own name, which only the server\'s operator can give to an app. Allow it once on the server with `pae system:public-routing:allow %2$s --host-domain`.';

    private const int DEFAULT_PORT = 443;

    public function __construct(
        private readonly EngineResolver $engines,
        private readonly PanelUrl $panelUrl,
    ) {}

    /**
     * @return bool whether the panel's address changed: the old one no longer answers
     *
     * @throws ValidationException  422 on `url`: the Engine refused the domain, the port or the certificate
     */
    public function move(string $host, int $port): bool
    {
        $username = SelfProject::username();
        if ($username === null) {
            abort(409, self::NOT_CONFIGURED);
        }

        $engineId = $this->engines->defaultEngineId();
        $project = new EngineProject($engineId, $username);
        $api = new DomainsApi($this->engines->forEngine($engineId));

        $domains = $this->engineCall(static fn (): array => $api->domains($project));
        $main = self::find($domains, static fn (array $domain): bool => ($domain['type'] ?? null) === 'main');
        $mainName = $main === null ? null : strtolower(Payload::string($main['domain'] ?? null));

        $moved = false;
        if ($host === $mainName) {
            if (self::mainPort($main) !== $port) {
                self::assertMovable($main);
                $this->update($api, $project, $host, ['https_ports' => [$port], 'https_port' => $port]);
                $moved = true;
            }
        } else {
            self::assertMovable($main);
            $target = self::find($domains, static fn (array $domain): bool => strtolower(Payload::string($domain['domain'] ?? null)) === $host);
            $added = $target === null;
            if ($added) {
                $this->create($api, $project, $host);
            }

            try {
                // The server's own name is served with the certificate the Engine holds for it; the Engine refuses
                // to request another under its shared zone.
                if ($host !== $this->serverName($engineId)) {
                    $this->requestSsl($api, $project, $host);
                }

                $change = ['main' => true];
                if (self::ports($target) !== [$port]) {
                    $change += ['https_ports' => [$port], 'https_port' => $port];
                }
                $this->update($api, $project, $host, $change);
            } catch (\Throwable $e) {
                if ($added) {
                    $this->withdraw($api, $project, $host);
                }

                throw $e;
            }
            $moved = true;

            if ($mainName !== null && $mainName !== '') {
                $this->delete($api, $project, $mainName);
            }
        }

        $this->dropPrevious($api, $project, $domains, $host, $mainName);

        return $moved;
    }

    /**
     * An older Engine reports no HTTPS ports, ignores `main` and cannot move the main domain off 443.
     *
     * @param  ?array<string, mixed>  $main
     */
    private static function assertMovable(?array $main): void
    {
        if ($main === null || ! array_key_exists('https_ports', Payload::object($main['details'] ?? null))) {
            throw ValidationException::withMessages(['url' => [self::ENGINE_TOO_OLD]]);
        }
    }

    private function create(DomainsApi $api, EngineProject $project, string $host): void
    {
        try {
            $api->createDomain($project, ['domain' => $host, 'type' => 'addon']);
        } catch (EngineValidationException $e) {
            // The Engine's own refusal (a domain that exists, a limit, the server's name) is the answer to the owner.
            throw ValidationException::withMessages(['url' => [$this->refusal($e, $project, $host)]]);
        } catch (EngineException) {
            abort(502, self::ENGINE_FAILED);
        }
    }

    /**
     * The Engine's refusal names its reason ("Could not obtain a certificate for x: DNS problem …"), so it is the
     * answer, read through `EngineErrors::message()`; a known refusal such as a name under a shared zone reads as the
     * panel's friendly sentence there. `SSL_FAILED` only when it says nothing.
     */
    private function requestSsl(DomainsApi $api, EngineProject $project, string $host): void
    {
        try {
            $api->requestSslCert($project, $host);
        } catch (EngineValidationException $e) {
            $message = trim(EngineErrors::message($e));
            throw ValidationException::withMessages(['url' => [$message !== '' ? $message : self::SSL_FAILED]]);
        } catch (EngineException) {
            abort(502, self::ENGINE_FAILED);
        }
    }

    /**
     * The Engine's own name (`system/info` `cert_domain`), or null when it has none or cannot say.
     */
    private function serverName(int $engineId): ?string
    {
        try {
            $name = strtolower(trim(Payload::string((new SystemApi($this->engines->forEngine($engineId)))->info()['cert_domain'] ?? null), " \t\n\r\0\x0B."));
        } catch (EngineException|EngineValidationException) {
            return null;
        }

        return $name === '' ? null : $name;
    }

    /**
     * @param  array{main?: true, https_ports?: list<int>, https_port?: int}  $change
     */
    private function update(DomainsApi $api, EngineProject $project, string $host, array $change): void
    {
        try {
            $api->updateDomain($project, $host, $change);
        } catch (EngineValidationException $e) {
            throw ValidationException::withMessages(['url' => [$this->refusal($e, $project, $host)]]);
        } catch (EngineRequestException $e) {
            abort($e->engineStatus === 409 ? 409 : 502, $e->engineStatus === 409 ? self::BUSY : self::ENGINE_FAILED);
        } catch (EngineException) {
            abort(502, self::ENGINE_FAILED);
        }
    }

    /**
     * After the move the panel answers on its new address, so a domain left behind is logged, not an error: it
     * only keeps answering until it is deleted by hand.
     */
    private function delete(DomainsApi $api, EngineProject $project, string $name): void
    {
        try {
            $api->deleteDomain($project, $name);
        } catch (EngineException|EngineValidationException $e) {
            Log::warning('A domain of the panel\'s project could not be deleted.', [
                'domain' => $name,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * The domain this attempt added goes again when the attempt fails, so a refused move leaves the project's
     * domains as they were. It stays when the Engine made it the main domain before it failed, and when the Engine
     * cannot say what it did: deleting the project's main domain would leave the panel without an address.
     */
    private function withdraw(DomainsApi $api, EngineProject $project, string $host): void
    {
        try {
            $domains = $api->domains($project);
        } catch (EngineException|EngineValidationException $e) {
            Log::warning('A domain added by a failed move could not be removed.', [
                'domain' => $host,
                'error' => $e->getMessage(),
            ]);

            return;
        }

        $added = self::find($domains, static fn (array $domain): bool => strtolower(Payload::string($domain['domain'] ?? null)) === $host);
        if ($added !== null && ($added['type'] ?? null) !== 'main') {
            $this->delete($api, $project, $host);
        }
    }

    /**
     * The two refusals only the server's operator can lift name the command that lifts them.
     */
    private function refusal(EngineValidationException $e, EngineProject $project, string $host): string
    {
        $codes = array_map(static fn (array $problem): string => Payload::string($problem['code'] ?? null), $e->problems);

        return match (true) {
            in_array('https_port_not_allowed', $codes, true) => sprintf(self::PORTS_NOT_ALLOWED, $project->username),
            in_array('host_domain_not_allowed', $codes, true) => sprintf(self::HOST_NOT_ALLOWED, $host, $project->username),
            default => EngineErrors::message($e),
        };
    }

    /**
     * Only the addon of the previous panel URL, as an older panel added it: the main domain and anything
     * added by hand stay.
     *
     * @param  list<array<string, mixed>>  $domains
     */
    private function dropPrevious(DomainsApi $api, EngineProject $project, array $domains, string $host, ?string $mainName): void
    {
        $stored = $this->panelUrl->stored();
        $previous = $stored === null ? null : parse_url($stored, PHP_URL_HOST);
        if (! is_string($previous) || $previous === '') {
            return;
        }
        $previous = strtolower($previous);
        if ($previous === $host || $previous === $mainName) {
            return;
        }

        $addon = self::find($domains, static fn (array $domain): bool => strtolower(Payload::string($domain['domain'] ?? null)) === $previous
            && ($domain['type'] ?? null) === 'addon');
        if ($addon !== null) {
            $this->delete($api, $project, Payload::string($addon['domain']));
        }
    }

    /**
     * The ports a domain answers HTTPS on; 443 for one the Engine reports none for (a new one, an older
     * Engine).
     *
     * @param  ?array<string, mixed>  $domain
     * @return list<int>
     */
    private static function ports(?array $domain): array
    {
        $ports = Payload::ints(Payload::object($domain['details'] ?? null)['https_ports'] ?? null);

        return $ports === [] ? [self::DEFAULT_PORT] : $ports;
    }

    /**
     * @param  ?array<string, mixed>  $domain
     */
    private static function mainPort(?array $domain): int
    {
        return Payload::int(Payload::object($domain['details'] ?? null)['https_port'] ?? null) ?? self::DEFAULT_PORT;
    }

    /**
     * @param  list<array<string, mixed>>  $domains
     * @param  callable(array<string, mixed>): bool  $match
     * @return ?array<string, mixed>
     */
    private static function find(array $domains, callable $match): ?array
    {
        foreach ($domains as $domain) {
            if ($match($domain)) {
                return $domain;
            }
        }

        return null;
    }

    /**
     * @template T
     *
     * @param  callable(): T  $call
     * @return T
     */
    private function engineCall(callable $call): mixed
    {
        try {
            return $call();
        } catch (EngineException|EngineValidationException) {
            abort(502, self::ENGINE_FAILED);
        }
    }
}
