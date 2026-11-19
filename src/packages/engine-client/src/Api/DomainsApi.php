<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine domain, SSL, PHP-version/settings and usage endpoints for one project.
 * Thin and stateless.
 */
final class DomainsApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function domains(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('domains'))->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function createDomain(EngineProject $project, array $params): Response
    {
        return $this->engine->post($project->enginePath('domains'), $params);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function updateDomain(EngineProject $project, string $domain, array $params): Response
    {
        return $this->engine->put($project->enginePath('domains/'.rawurlencode($domain)), $params);
    }

    /**
     * Deleting the project's main domain renames the project, which the Engine
     * refuses on a protected project (EnsureProjectNotProtected.php:54/139);
     * any other domain passes.
     */
    public function deleteDomain(EngineProject $project, string $domain): Response
    {
        if ($domain === (string) $project->domain) {
            ProjectProtectedException::throwIfProtected($project);
        }

        return $this->engine->delete($project->enginePath('domains/'.rawurlencode($domain)));
    }

    /**
     * Every certificate installed on the project's domains, one
     * `getSslCertificateInfo()` each (with the `CertificateStatus` verdict).
     * Domains without a certificate are left out.
     *
     * Engine: core/routes/api.php:195 → DomainController::indexInstalledSslCerts.
     *
     * @return list<array<string, mixed>>
     */
    public function installedSslCerts(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('domains/installed-ssl-certs'))->json('data'));
    }

    /**
     * One domain's installed certificate with the Engine's validity verdict
     * (`status`, `covers_domain`, `expires_at`, `days_remaining`); 404 when it
     * has none.
     *
     * Engine: core/routes/api.php:197 → DomainController::installedSslCert.
     *
     * @return array<string, mixed>
     */
    public function installedSslCert(EngineProject $project, string $domain): array
    {
        return Payload::object($this->engine->get($project->enginePath('domains/'.rawurlencode($domain).'/installed-ssl-cert'))->json('data'));
    }

    /**
     * The certificate the domain really serves: a TLS handshake with the
     * domain as SNI at the address its DNS gives (`public`, what a visitor
     * gets) and at the project's webserver (`engine`, with `serves_installed`).
     * The top-level `status` is the public verdict (`CertificateStatus`) or
     * `not_resolving`, `refused_address`, `unreachable`; `dns.points_here`
     * tells whether the name points at this host. 404 on an Engine without the
     * route (before 2.2.0) or for an unknown domain.
     *
     * Engine: core/routes/api.php:198 → DomainController::sslCheck → SslCheck::forDomain
     * (core/app/Lib/Ssl/SslCheck.php:58).
     *
     * @return array<string, mixed>
     */
    public function sslCheck(EngineProject $project, string $domain): array
    {
        return Payload::object($this->engine->get($project->enginePath('domains/'.rawurlencode($domain).'/ssl-check'))->json('data'));
    }

    /**
     * @return array<string, mixed>
     */
    public function requestSslCert(EngineProject $project, string $domain): array
    {
        return Payload::object($this->engine->post($project->enginePath('domains/'.rawurlencode($domain).'/request-ssl-cert'))->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function installSslCert(EngineProject $project, string $domain, array $params): Response
    {
        return $this->engine->put($project->enginePath('domains/'.rawurlencode($domain).'/install-ssl-cert'), $params);
    }

    /**
     * Removes the certificate installed on the domain, private key included, and
     * gives it the certificate a new domain gets: the Engine's own where that
     * covers the name, otherwise the one the issuer setting names (self-signed
     * by default). The answer is the certificate the domain carries now, in
     * `installed-ssl-cert`'s shape. A domain with SSL turned off is a 422
     * `problems[].code: ssl_disabled`; an Engine without the route answers 405
     * (or 404 where it does not serve the path at all).
     *
     * Engine: core/routes/api.php:228 → DomainController::destroyInstalledSslCert
     * (core/app/Http/Controllers/User/DomainController.php:626).
     *
     * @return array<string, mixed>
     */
    public function removeSslCert(EngineProject $project, string $domain): array
    {
        return Payload::object($this->engine->delete($project->enginePath('domains/'.rawurlencode($domain).'/installed-ssl-cert'))->json('data'));
    }

    /**
     * PHP version of one domain. The Engine route is **global** (keyed by domain
     * name, not project-scoped) – `E:/domains/{d}/php-version`
     * (Engine: core/routes/api.php:350 → DomainController::getPhpVersion,
     * {data:string}; caller must have verified the domain belongs to the
     * project).
     *
     * @return array<string, mixed>|string
     */
    public function phpVersion(EngineProject $project, string $domain): array|string
    {
        return Payload::arrayOrString($this->engine->get('domains/'.rawurlencode($domain).'/php-version')->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function setPhpVersion(EngineProject $project, string $domain, array $params): Response
    {
        // Engine: core/routes/api.php:351 → DomainController::setPhpVersion.
        return $this->engine->put('domains/'.rawurlencode($domain).'/php-version', $params);
    }

    /**
     * @return array<string, mixed>
     */
    public function phpDirectives(EngineProject $project, string $domain): array
    {
        // Engine: core/routes/api.php:352 → DomainController::getPhpDirectives,
        // {data:object} (an empty directive set comes back as {}).
        return Payload::object($this->engine->get('domains/'.rawurlencode($domain).'/php-directives')->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function setPhpDirectives(EngineProject $project, string $domain, array $params): Response
    {
        // Engine: core/routes/api.php:353 → DomainController::setPhpDirectives, 204.
        return $this->engine->put('domains/'.rawurlencode($domain).'/php-directives', $params);
    }

    /**
     * @return list<string>
     */
    public function availablePhpVersions(): array
    {
        return Payload::strings($this->engine->get('php/available-versions')->json('data'));
    }

    /**
     * Attach a sibling PanelAlpha Online tunnel to a project domain.
     * Engine 201 `{data:TunnelResource}` with top-level `purpose` and
     * `valid_until` (the engine-enforced expiry; `core/app/Http/Resources/
     * TunnelResource.php:24-26`). `purpose: preview` with a `ttl_minutes` gives a
     * tunnel that expires; the `default` purpose never does. A null `hostname`
     * is not sent: the Engine then allocates a `preview-<8>` label under
     * panelalpha.online and answers 409 `tunnel_hostname_unavailable` when five
     * labels in a row are taken (`TunnelStoreRequest.php:21`,
     * `TunnelManager::createAllocatedTunnel`).
     *
     * Engine: core/routes/api.php:177 → TunnelController::store
     * (core/app/Http/Controllers/User/TunnelController.php:151-172).
     *
     * @return array<string, mixed>
     */
    public function createTunnel(
        EngineProject $project,
        string $domain,
        ?string $hostname,
        string $provider = 'panelalpha',
        ?string $purpose = null,
        ?int $ttlMinutes = null,
    ): array {
        return Payload::object($this->engine
            ->post($project->enginePath('domains/'.rawurlencode($domain).'/tunnels'), array_filter([
                'hostname' => $hostname,
                'provider' => $provider,
                'purpose' => $purpose,
                'ttl_minutes' => $ttlMinutes,
            ], static fn ($value) => $value !== null))
            ->json('data'));
    }

    /**
     * The tunnels attached to one domain. Engine 200 `{data:[TunnelResource]}`.
     *
     * Engine: core/routes/api.php:175 → TunnelController::index
     * (core/app/Http/Controllers/User/TunnelController.php:47).
     *
     * @return list<array<string, mixed>>
     */
    public function tunnels(EngineProject $project, string $domain): array
    {
        return Payload::objects($this->engine
            ->get($project->enginePath('domains/'.rawurlencode($domain).'/tunnels'))
            ->json('data'));
    }

    /**
     * Remove one tunnel hostname. Engine 200 `{success:true}`; a 404 means the
     * tunnel is already gone (the caller treats it as idempotent).
     *
     * Engine: core/routes/api.php:177 → TunnelController::destroy
     * (core/app/Http/Controllers/User/TunnelController.php:158).
     */
    public function deleteTunnel(EngineProject $project, string $domain, string $hostname): Response
    {
        return $this->engine->delete(
            $project->enginePath('domains/'.rawurlencode($domain).'/tunnels/'.rawurlencode($hostname)),
        );
    }

}
