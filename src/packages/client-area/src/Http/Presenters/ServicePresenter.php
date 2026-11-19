<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\DiagnosticMode;
use PanelAlpha\ClientArea\Contracts\ServerIpv4Addresses;
use PanelAlpha\ClientArea\Contracts\ServiceDnsEmail;
use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Services\HostingService;

/**
 * Shapes the one virtual hosting service and its server accounts the way the
 * Client Area's hosting pages read them (old
 * User\ServiceResource + User\ServerAccountResource).
 *
 * Community has exactly one service (the virtual service, {@see HostingService})
 * whose server accounts are the synced Engine projects; a paid edition one per
 * user and plan. The service `privileges` is the union of the
 * user's application privileges and each account carries its own application's
 * privileges, so the CA shows "My Server".
 */
final class ServicePresenter
{
    public function __construct(
        private readonly AccessResolver $access,
        private readonly DiagnosticMode $diagnosticMode,
        private readonly ServiceDnsEmail $dnsEmail,
        private readonly ServiceOnboarding $onboarding,
        private readonly ServerIpv4Addresses $serverIps,
    ) {}

    /**
     * @param  list<Application>  $applications
     * @return array<string, mixed>
     */
    public function present(Authenticatable $user, HostingService $service, array $applications): array
    {
        $serverAccounts = array_map(fn (Application $app) => $this->serverAccount($user, $service, $app), $applications);
        $active = array_values(array_filter($applications, fn (Application $app) => $app->status === 'active'));
        // The DNS and e-mail servers' flags (none in Community).
        $servers = $this->dnsEmail->serviceFields($service);
        // The DNS records and verification of the service's domains, which the
        // Domains page and its Add Domain step render (the plan's in the paid
        // editions, the single server's A record here).
        $dnsSettings = Payload::object(Payload::object($this->onboarding->homeFields($service)['onboarding'] ?? null)['dns_settings'] ?? null);

        return [
            'id' => $service->id,
            // The old `www.`-less domains.
            'domain' => isset($applications[0]) ? $applications[0]->presentedDomain() : null,
            // The CA counts a service's instances from this list (skipping
            // staging rows whose `parent_id` is set), Services.vue:168-172.
            'instances' => array_map(fn (Application $app): array => [
                'id' => $app->id,
                'parent_id' => $app->staging_of_id,
                'domain' => $app->presentedDomain(),
                'domain_type' => null,
            ], $applications),
            'instances_count' => count($active),
            'is_trial' => $service->isTrial,
            'trial_expiry_at' => $service->trialExpiresAt,
            'plan_name' => $service->planName,
            // The trial's "Upgrade" (CA: components/dataIterator/tables/ServicesTable.vue:110).
            'plan_upgrade_link' => $service->upgradeLink,
            'plan_settings' => [
                'instance_limit' => $service->projectLimit ?? PHP_INT_MAX,
                'dns_management_enabled' => $servers['dns_management_enabled'],
                'domain_transfer_enabled' => false,
                'allow_user_enable_ssh_access' => false,
                'default_ssh_access_enabled' => false,
                'eager_domain_dns_verification_enabled' => false,
            ],
            'server_settings' => [
                'domain_transfer_allowed' => false,
            ],
            'dns_settings' => $dnsSettings,
            'server_accounts' => $serverAccounts,
            'hosting_server_type' => 'panelalpha',
            'dns_server_enabled' => $servers['dns_server_enabled'],
            'dns_server_internal' => $servers['dns_server_internal'],
            'dns_server_type' => $servers['dns_server_type'],
            'email_server_enabled' => $servers['email_server_enabled'],
            'email_server_internal' => $servers['email_server_internal'],
            'email_server_type' => $servers['email_server_type'],
            'status' => $service->status,
            'owned' => $service->owned,
            'privileges' => $this->dnsEmail->servicePrivileges($user, $service, $applications, $this->unionPrivileges($user, $applications)),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serverAccount(Authenticatable $user, HostingService $service, Application $app): array
    {
        $payload = is_array($app->engine_payload) ? $app->engine_payload : [];
        $rawDetails = Payload::object($payload['details'] ?? null);
        $config = Payload::object($payload['config'] ?? null);

        // A project the Engine gave no address (no user IP, or user IPs off)
        // gets the server's, as `/home` does, so the DNS instructions keep an A record.
        $ipv4 = $this->ipv4Addresses($config);
        if ($ipv4 === []) {
            $ipv4 = $this->serverIps->addresses();
        }
        // The CA copies these onto the account from
        // `details` (`views/hosting/index.vue:223-243`, `Databases.vue:1066`),
        // as the old `ServerAccount` did (packages/api ServerAccount.php:321).
        // The raw Engine keys (`home_dir`, `mysql_prefix`, …) stay too.
        $details = array_merge(
            $rawDetails,
            ServerAccountDetails::derive($config, $rawDetails, $ipv4, (string) $app->engine_username, $app->presentedDomain()),
        );

        return [
            'id' => $app->id,
            'domain' => $app->presentedDomain(),
            'additional_domains' => [],
            'main_domain_nameservers' => [],
            'username' => $app->engine_username,
            'service_id' => $service->id,
            'server_id' => $app->engine_id,
            'server_name' => 'My Server',
            'server_type' => 'panelalpha',
            'ipv4_addresses' => $ipv4,
            'host_c_names' => [],
            'details' => $details,
            'status' => $app->status,
            // The hosting account's own diagnostic mode (old
            // `ServerAccountResource`); the CA hides its hosting forms on it
            // (views/hosting/Summary.vue:61, Domains.vue:17).
            'diagnostic_mode' => $this->diagnosticMode->blockedEntity($app) === DiagnosticMode::HOSTING_ACCOUNT,
            'diagnostic_mode_details' => null,
            'owned' => true,
            'privileges' => $this->access->privileges($user, $app),
        ];
    }

    /**
     * The Engine's public IPv4 list (`config.ip_addresses.ipv4`), filtered to
     * real IPv4 literals; the mirror value is untrusted.
     *
     * @param  array<string, mixed>  $config
     * @return list<string>
     */
    private function ipv4Addresses(array $config): array
    {
        $addresses = Payload::object($config['ip_addresses'] ?? []);

        return array_values(array_filter(
            Payload::strings($addresses['ipv4'] ?? []),
            static fn (string $ip): bool => filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false,
        ));
    }

    /**
     * @param  list<Application>  $applications
     * @return list<string>
     */
    private function unionPrivileges(Authenticatable $user, array $applications): array
    {
        $privileges = [];
        foreach ($applications as $application) {
            $privileges = array_merge($privileges, $this->access->privileges($user, $application));
        }

        return array_values(array_unique($privileges));
    }
}
