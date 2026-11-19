<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\ClientArea\Hosting\PreviewTunnelService;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\SystemApi;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PanelAlpha\ClientArea\Events\ProjectDomainChanged;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Changing a project's main domain. The Engine renames the main domain itself
 * (`PUT /projects/{u} {domain}`); the panel only supplies the subdomain bases
 * and the IPs the CA shows, and runs the old checks first.
 */
final class DomainChangeService
{
    public function __construct(
        private readonly EngineResolver $engines,
        private readonly PreviewTunnelService $previews,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function options(Application $application): array
    {
        // One `GET system/info` per request. The Engine names the
        // address `default_ipv4` and has no nameservers.
        $info = $this->system($application)->info();

        $ip = Payload::nullableString($info['default_ipv4'] ?? null);
        $ips = $ip !== null && $ip !== '' ? [$ip] : [];

        return [
            'subdomains' => SystemApi::renameBasesFrom($info),
            'ip_address' => $ips[0] ?? null,
            'ipv4_addresses' => $ips,
            'cdn_dns_records' => [],
            'nameservers' => [],
            'order_domain_link' => '',
        ];
    }

    /**
     * @throws ValidationException
     */
    /**
     * @return string the new domain, for the activity-log payload
     *
     * @throws ValidationException
     */
    public function changeToDomain(Application $application, string $domain): string
    {
        $domain = strtolower(trim($domain));

        if (! $this->isHostname($domain)) {
            throw ValidationException::withMessages(['domain' => ['Invalid domain name.']]);
        }
        if ($this->isBlocked($domain)) {
            throw ValidationException::withMessages(['domain' => ['Domain name is not available.']]);
        }

        $this->changeDomain($application, $domain);

        return $domain;
    }

    /**
     * @return string the new `subdomain.domain`, for the activity-log payload
     *
     * @throws ValidationException
     */
    public function changeToSubdomain(Application $application, string $subdomain, string $domain): string
    {
        $subdomain = strtolower(trim($subdomain));
        $domain = strtolower(trim($domain));

        // The base must be one of the bases the Engine renames onto (old plan
        // `getDomainsForSubdomains()`; never panelalpha.online, which the
        // Engine refuses for a main domain).
        $bases = SystemApi::renameBasesFrom($this->system($application)->info());
        if (! in_array($domain, $bases, true)) {
            throw ValidationException::withMessages(['domain' => ['Domain name is not available.']]);
        }
        if ($this->isBlocked($subdomain)) {
            throw ValidationException::withMessages(['subdomain' => ['Domain name is not available.']]);
        }

        $full = $subdomain.'.'.$domain;
        if (! $this->isHostname($full)) {
            throw ValidationException::withMessages(['subdomain' => ['Invalid domain name.']]);
        }

        $this->changeDomain($application, $full);

        return $full;
    }

    public function changeDomain(Application $application, string $domain): void
    {
        // The Engine renames to the name as given and adds a `www` alias to it,
        // so a `www.` name would become the main domain with a `www.www.` alias.
        if (str_starts_with($domain, 'www.')) {
            throw ValidationException::withMessages(['domain' => ["Domain cannot start with 'www.'"]]);
        }

        $oldDomain = Payload::nullableString($application->domain);

        // A protected project is refused before any Engine write (the rename
        // checks too).
        ProjectProtectedException::throwIfProtected($application->engineProject());

        // The rename goes first: the Engine refuses it with
        // `domain_has_tunnels` while a preview tunnel forwards to the old main
        // domain, and only that refusal releases the panel's previews and
        // retries once. Releasing them up front deleted the preview link for a
        // rename that was then refused for another reason, and a stale mirror
        // or a failed tunnel list aborted renames the Engine accepted.
        $renamed = $this->previews->renameMainDomain($application, $domain, (string) $oldDomain);

        // The Engine rename is synchronous and its answer is authoritative
        //Persist the new main domain, so the response, a
        // follow-up GET /projects/{id} and the resolve mirror see it without
        // waiting for the next sync. Never before the Engine confirmed.
        $newDomain = Payload::nullableString($renamed['domain'] ?? null) ?? $domain;
        $application->domain = $newDomain;
        $application->save();

        // The rename is committed; for a WordPress project the controller's
        // listener runs the search-replace. The old main domain's tunnels went with its Engine domain
        // row, so there is no tunnel cleanup.
        ProjectDomainChanged::dispatch($application, $oldDomain, $newDomain);
    }

    private function isHostname(string $domain): bool
    {
        return filter_var($domain, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false;
    }

    private function isBlocked(string $name): bool
    {
        /** @var list<string> $blacklist */
        $blacklist = (array) config('client-area.subdomains_blacklist', []);

        return $blacklist !== [] && Str::is($blacklist, $name);
    }

    private function system(Application $application): SystemApi
    {
        // The project's own Engine, not the default one.
        return new SystemApi($this->engines->forEngine($application->engine_id));
    }
}
