<?php

namespace PanelAlpha\EngineClient\Api;

use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine-wide system info. `GET system/info` carries
 * `sites_base_domain`, `ipv4_addresses` and the nameservers.
 */
final class SystemApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * Engine: core/routes/api.php:369 → SystemController::info, `{data:{…}}`.
     *
     * @return array<string, mixed>
     */
    public function info(): array
    {
        return Payload::object($this->engine->get('system/info')->json('data'));
    }

    /**
     * The API features this Engine lists (`data.features`, Engine 2.3.0
     * `SystemController::info` -> `ApiFeatures::ALL`); an older Engine has no
     * such key, which is no features. Read it through `EngineFeatures`, which
     * caches it per Engine.
     *
     * @return list<string>
     */
    public function features(): array
    {
        return Payload::strings($this->info()['features'] ?? []);
    }

    /**
     * Starts the Engine's update script (`PUT system/update`); 409 while one
     * runs. Answers the latest update run: `{started_at, finished_at, pid,
     * exit_code, tail_stdout, tail_stderr, from_version, to_version, logs_path}`.
     *
     * @return array<string, mixed>
     */
    public function update(?string $licenseKey = null): array
    {
        $params = $licenseKey !== null && $licenseKey !== '' ? ['license_key' => $licenseKey] : [];

        return Payload::object($this->engine->put('system/update', $params)->json('data'));
    }

    /**
     * Starts the change-webserver script; answers the latest change run (the
     * same shape as update()).
     *
     * @return array<string, mixed>
     */
    public function changeWebserver(string $webserver, ?string $serialNumber = null): array
    {
        $params = ['new_webserver' => $webserver];
        if ($serialNumber !== null && $serialNumber !== '') {
            $params['serial_number'] = $serialNumber;
        }

        return Payload::object($this->engine->put('system/change-webserver', $params)->json('data'));
    }

    /**
     * (Open)LiteSpeed only; the Engine answers 422 on nginx-proxy.
     */
    public function resetWebserverPanelPassword(): string
    {
        return Payload::string($this->engine->put('system/reset-webserver-panel-password')->json('data.new_password'));
    }

    /**
     * (Open)LiteSpeed only; the Engine answers 422 on nginx-proxy.
     *
     * @param  array<string, mixed>  $config  serial_number
     */
    public function updateWebserverConfig(array $config): void
    {
        $this->engine->put('system/webserver-config', $config);
    }

    /**
     * The outgoing mail (Exim smarthost) settings.
     *
     * @return array<string, mixed>
     */
    public function eximConfig(): array
    {
        return Payload::object($this->engine->get('system/exim-config')->json('data'));
    }

    /**
     * Fields sent are merged into the stored config; null or '' clears one.
     *
     * @param  array<string, mixed>  $config
     */
    public function updateEximConfig(array $config): void
    {
        $this->engine->put('system/exim-config', $config);
    }

    /**
     * Sends a test email; a `config` sent is stored first (the Engine merges
     * it into the mail config). Answers `{exit_code, stdout, stderr, status,
     * reason}`.
     *
     * @param  array<string, mixed>|null  $config
     * @return array<string, mixed>
     */
    public function sendTestEmail(string $email, ?array $config = null): array
    {
        $params = ['email' => $email];
        if ($config !== null) {
            $params['config'] = $config;
        }

        return Payload::object($this->engine->post('system/exim-send-test-email', $params)->json('data'));
    }

    /**
     * How the Engine obtains project certificates: `issuer` (`self_signed`, the
     * default, or `acme`: Let's Encrypt over HTTP-01 as each domain is created
     * and renewed daily), `sites_base_domain`, `shared_zone`,
     * `shared_zone_issuance`, `acme_directory_url`, `acme_email`.
     *
     * Engine: core/app/Http/Controllers/SystemController.php:191 -> getSslConfig,
     * `{data: sslConfig()}` (:304-320).
     *
     * @return array<string, mixed>
     */
    public function sslConfig(): array
    {
        return Payload::object($this->engine->get('system/ssl-config')->json('data'));
    }

    /**
     * Changes only the fields sent; '' clears `acme_email`. Answers the stored
     * configuration (the same shape as sslConfig()).
     *
     * Engine: core/app/Http/Controllers/SystemController.php:246 -> updateSslConfig.
     *
     * @param  array{issuer?: 'self_signed'|'acme', acme_email?: string, acme_directory_url?: string, sites_base_domain?: string, shared_zone_issuance?: bool}  $config
     * @return array<string, mixed>
     */
    public function updateSslConfig(array $config): array
    {
        return Payload::object($this->engine->put('system/ssl-config', $config)->json('data'));
    }

    /**
     * The base domains a project subdomain may use (the CA's `subdomains`).
     *
     * @return list<string>
     */
    public function subdomainBases(string $fallback = 'panelalpha.online'): array
    {
        return self::subdomainBasesFrom($this->info(), $fallback);
    }

    /**
     * The bases a project subdomain may use, from an already-fetched
     * `system/info` (one Engine call per request).
     *
     * @param  array<string, mixed>  $info
     * @return list<string>
     */
    public static function subdomainBasesFrom(array $info, string $fallback = 'panelalpha.online'): array
    {
        $bases = [];

        $single = Payload::nullableString($info['sites_base_domain'] ?? null);
        if ($single !== null && $single !== '') {
            $bases[] = $single;
        }

        // The Engine has no `sites_base_domains`; kept for a future multi list.
        foreach (Payload::strings($info['sites_base_domains'] ?? []) as $base) {
            if ($base !== '') {
                $bases[] = $base;
            }
        }

        $bases = array_values(array_unique($bases));

        return $bases === [] ? [$fallback] : $bases;
    }

    /**
     * The bases a project's main domain may be renamed onto (change-domain's
     * `subdomains`), from an already-fetched `system/info`: the sites base
     * domain(s), else the Engine's own direct base – `cert_domain`, else the
     * dashed default address under panelalpha.direct, the name the Engine
     * itself gives a new project (Engine `DomainPlan::directDomain`). Names
     * under panelalpha.online are never offered: the Engine refuses to rename
     * a main domain into that zone (`MainDomainRename`, code
     * `domain_proxy_zone`).
     *
     * @param  array<string, mixed>  $info
     * @return list<string>
     */
    public static function renameBasesFrom(array $info): array
    {
        $bases = array_values(array_filter(
            self::subdomainBasesFrom($info, ''),
            static fn (string $base): bool => $base !== '' && ! self::inOnlineZone($base),
        ));
        if ($bases !== []) {
            return $bases;
        }

        $certDomain = strtolower(trim(Payload::string($info['cert_domain'] ?? null), " \t\n\r\0\x0B."));
        if ($certDomain !== '' && ! self::inOnlineZone($certDomain)) {
            return [$certDomain];
        }

        $ipv4 = Payload::string($info['default_ipv4'] ?? null);
        if (filter_var($ipv4, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
            return [str_replace('.', '-', $ipv4).'.panelalpha.direct'];
        }

        return [];
    }

    /**
     * Whether the name is in the PanelAlpha Online zone: the proxy serves those
     * names, and the Engine refuses to make one a project's main domain
     * (`MainDomainRename::refusal()`, code `domain_proxy_zone`).
     */
    public static function inOnlineZone(string $domain): bool
    {
        $domain = strtolower(trim($domain, '.'));

        return $domain === 'panelalpha.online' || str_ends_with($domain, '.panelalpha.online');
    }
}
