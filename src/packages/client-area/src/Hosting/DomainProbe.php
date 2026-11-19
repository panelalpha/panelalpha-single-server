<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\DomainsApi;
use PanelAlpha\EngineClient\Exceptions\EngineNotConfiguredException;
use PanelAlpha\ClientArea\Hosting\DomainValidation;
use PanelAlpha\ClientArea\Hosting\HostResolver;
use PanelAlpha\ClientArea\Hosting\ServerAccountService;
use PanelAlpha\ClientArea\Models\Application;

/**
 * The panel-side domain probe the Engine cannot
 * serve. It absorbs `DomainValidation::resolves`, `addressFor` and
 * `engineAddress`, and is consumed by `DomainProbeController` and
 * `InstanceSslController`.
 *
 * The certificate reads are **not** probed by the panel: they return the
 * Engine's live `ssl-check` (the certificate the domain's DNS address really
 * serves) and its validity verdict (`CertificateStatus` – expiry, self-signed,
 * issuer trust, wildcard-aware name match) through
 * {@see ServerAccountService::servedCertificate()}, so the panel never opens a
 * TLS socket or decides on its own whether a certificate is valid.
 *
 * `resolves()` answers "does the domain answer on the Engine" the old way
 * (`CURLOPT_RESOLVE domain:443:<project-ip>` + `$response->successful()`): an
 * HTTPS GET to `https://<domain>/` pinned to the **project's own public IP**
 * with SNI = the domain, never the user's DNS, and only a 2xx means resolved
 * (old `DomainController::resolve` pinned to
 * `$domain->serverAccount->getIpAddress()`). The Engine host is
 * resolved once through the injected HostResolver as the fallback, so tests
 * never touch DNS.
 *
 * Permanent panel code: every certificate read is the Engine's `ssl-check`
 * and the reachability probe stays panel-side, so it moved from
 * client-area-legacy into the controller.
 */
final class DomainProbe
{
    public function __construct(
        private readonly DomainValidation $validation,
        private readonly PinnedProbe $probe,
        private readonly EngineResolver $engines,
        private readonly HostResolver $resolver,
        private readonly ServerAccountService $accounts,
    ) {}

    /**
     * The application one of the user's known domains belongs to.
     *
     * @param  Collection<int, Application>  $applications
     */
    public function ownerOf(string $domain, Collection $applications): ?Application
    {
        return $this->validation->ownerOf($domain, $applications);
    }

    /**
     * Validate a domain name and require it to be one of the user's own.
     *
     * @param  list<string>  $knownDomains
     *
     * @throws ValidationException
     */
    public function assertKnownDomain(string $domain, array $knownDomains): string
    {
        return $this->validation->assertKnownDomain($domain, $knownDomains);
    }

    /**
     * @param  list<string>  $knownDomains  the user's application domains
     * @param  Application|null  $owner  the application the domain belongs to, so the
     *                                   probe pins to its public IP
     *
     * @throws ValidationException
     */
    public function resolves(string $domain, array $knownDomains, ?Application $owner = null): bool
    {
        $name = $this->assertKnownDomain($domain, $knownDomains);

        $ip = $this->addressFor($owner);
        if ($ip === null) {
            return false;
        }

        $status = $this->probe->httpsStatus($name, $ip);

        // The old panel's `$response->successful()`: 2xx only (a redirect means
        // the domain answers, but not "resolved" on the Engine).
        return $status !== null && $status >= 200 && $status < 300;
    }

    /**
     * The certificate one of the owner's domains serves (Engine `ssl-check`),
     * or null when there is no owner or nothing was served.
     *
     * @return array<string, mixed>|null
     */
    public function certificate(string $host, ?Application $owner): ?array
    {
        return $owner === null ? null : $this->accounts->servedCertificate($owner, $owner->engineDomainName($host));
    }

    /**
     * The certificate one of the project's Engine domains serves. The
     * domain must be one of the project's Engine domains (old `findDomain`);
     * otherwise the request is rejected before the Engine is asked.
     *
     * @return array<string, mixed>|null
     *
     * @throws ValidationException
     */
    public function certificateForDomain(Application $application, string $domain): ?array
    {
        $domains = (new DomainsApi($application->engine()))->domains($application->engineProject());

        // The CA sends the project's domain as it was shown, without `www.`
        //A domain of exactly that name wins, otherwise the
        // presented main domain is the mirrored one.
        foreach ([$domain, $application->engineDomainName($domain)] as $name) {
            foreach ($domains as $candidate) {
                if (($candidate['domain'] ?? null) === $name) {
                    return $this->accounts->servedCertificate($application, $name);
                }
            }
        }

        throw ValidationException::withMessages(['domain' => ['Invalid domain.']]);
    }

    /**
     * The certificate the project's own domain (the host of its URL) serves
     * (`ssl/certificate/detected-by-url`).
     *
     * @return array<string, mixed>|null
     */
    public function certificateForUrl(Application $application): ?array
    {
        $domain = (string) ($application->domain ?? '');

        return $domain === '' ? null : $this->accounts->servedCertificate($application, $domain);
    }

    /**
     * The IP a pinned probe of this application connects to: the project's own
     * public IPv4 (`config.ip_addresses.ipv4[0]`, old
     * `ServerAccount::getIpAddress()`), falling back to the Engine API host only
     * when the mirror has none.
     */
    public function addressFor(?Application $application): ?string
    {
        return $application?->publicIp() ?? $this->engineAddress($application);
    }

    /**
     * The Engine's IP the pinned probes connect to: the first address the
     * application's **own** Engine host resolves to (the default Engine when no
     * application is given), or the literal when the URL already uses one.
     * null when the Engine is not configured or its host does not resolve.
     * Using the application's Engine matters once Pro/Multi host more than one
     * Engine, where the default's address would pin to the wrong server.
     */
    public function engineAddress(?Application $application = null): ?string
    {
        try {
            $client = $application === null
                ? $this->engines->forEngine($this->engines->defaultEngineId())
                : $this->engines->forEngine($application->engine_id);
            $url = $client->connection()->url;
        } catch (EngineNotConfiguredException) {
            return null;
        }

        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            return null;
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return $host;
        }

        foreach ($this->resolver->addresses($host) as $address) {
            $address = trim(trim($address), '[]');
            if ($address !== '') {
                return $address;
            }
        }

        return null;
    }
}
