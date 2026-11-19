<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Services\HostingService;

/**
 * A service's DNS and e-mail servers as the Client Area sees them (old
 * `User\ServiceResource`, packages/api/app/Http/Resources/User/ServiceResource.php:58-95,
 * `InstanceResource`, packages/api/app/Http/Resources/InstanceResource.php:126-153, :209-210, and
 * `Service::getPrivilegesList()`, packages/api/app/Models/Service.php:1165-1188):
 * the flags the hosting pages are gated by (views/hosting/index.vue:138-160,
 * components/HostingPagesSidebar.vue:184-220) and the service's privilege list.
 * Community has no DNS or e-mail servers: the controller's default answers today's
 * values; the paid Admin Area binds the answer from the service's servers and
 * plan.
 */
interface ServiceDnsEmail
{
    /**
     * The service payload's keys: `plan_settings.dns_management_enabled` (as
     * `dns_management_enabled`), `dns_server_enabled`, `dns_server_internal`,
     * `dns_server_type`, `email_server_enabled`, `email_server_internal`,
     * `email_server_type`.
     *
     * @return array{dns_management_enabled: bool, dns_server_enabled: bool, dns_server_internal: bool, dns_server_type: string|null, email_server_enabled: bool, email_server_internal: bool, email_server_type: string|null}
     */
    public function serviceFields(HostingService $service): array;

    /**
     * The project payload's keys (the project and its service): `service_has_dns`,
     * `service_has_email`, `plan_settings.dns_management_enabled` (as
     * `dns_management_enabled`) and the Cloudflare page's gate and nameservers
     *`service_has_dns_cloudflare`, `domain_has_dns_zone`,
     * `domain_zone` (the old `DnsZoneResource` or null), `dns_nameservers`,
     * `service_nameservers`.
     *
     * @return array{service_has_dns: bool, service_has_email: bool, dns_management_enabled: bool, service_has_dns_cloudflare: bool, domain_has_dns_zone: bool, domain_zone: array<string, mixed>|null, dns_nameservers: list<string>, service_nameservers: list<string>}
     */
    public function projectFields(Application $application, HostingService $service): array;

    /**
     * The `/home` `user.services[].dns_server` the onboarding's DNS
     * verification compares the domain's nameservers with
     * (OnboardingDomainInstantVerificationModal.vue:154-185; old
     * `Service::dnsServerEnabled()` and `getStaticNameservers()`,
     * packages/api/app/Models/Service.php:225-228, :621-634).
     *
     * @return array{enabled: bool, nameservers: list<string>}
     */
    public function dnsServer(HostingService $service): array;

    /**
     * The service payload's privileges from the union of the user's projects
     * of the service (old `getPrivilegesList()`: an owner without projects has
     * everything the plan allows; no `hosting.manage_dns` while the service's
     * DNS server has no zone).
     *
     * @param  list<Application>  $applications  the user's projects of the service
     * @param  list<string>  $privileges  the union of their privileges
     * @return list<string>
     */
    public function servicePrivileges(Authenticatable $user, HostingService $service, array $applications, array $privileges): array;
}
