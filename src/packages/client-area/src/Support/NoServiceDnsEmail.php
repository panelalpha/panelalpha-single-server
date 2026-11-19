<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Contracts\ServiceDnsEmail;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Services\HostingService;

/**
 * Community's answer: no DNS or e-mail servers (the single-server build disabled
 * them), so the hosting pages and the Cloudflare page stay hidden and the
 * privileges are the projects'.
 */
final class NoServiceDnsEmail implements ServiceDnsEmail
{
    public function serviceFields(HostingService $service): array
    {
        return [
            'dns_management_enabled' => false,
            'dns_server_enabled' => false,
            'dns_server_internal' => true,
            'dns_server_type' => null,
            'email_server_enabled' => false,
            'email_server_internal' => true,
            'email_server_type' => null,
        ];
    }

    public function projectFields(Application $application, HostingService $service): array
    {
        // The Engine has no nameservers of its own, and no zone
        // exists without a DNS server.
        return [
            'service_has_dns' => false,
            'service_has_email' => false,
            'dns_management_enabled' => false,
            'service_has_dns_cloudflare' => false,
            'domain_has_dns_zone' => false,
            'domain_zone' => null,
            'dns_nameservers' => [],
            'service_nameservers' => [],
        ];
    }

    public function dnsServer(HostingService $service): array
    {
        // No DNS server, so the verification never compares nameservers.
        return ['enabled' => false, 'nameservers' => []];
    }

    public function servicePrivileges(Authenticatable $user, HostingService $service, array $applications, array $privileges): array
    {
        return $privileges;
    }
}
