<?php

namespace PanelAlpha\ClientArea\Support;

use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Services\HostingService;

/**
 * Community's answer: no plans, so every service has the simple onboarding – no
 * theme step, no advanced form, nothing installed from a template – the domain
 * step asks for a domain (a free subdomain of the Engine's sites base among
 * the choices), the site keeps the name sent (else its domain), every project
 * type is allowed and the theme browser blocks nothing (today's values).
 */
final class SimpleServiceOnboarding implements ServiceOnboarding
{
    /**
     * The DNS help a single server can give without a plan: the A record of the
     * server's IPv4 and the `www` CNAME of the domain (the old payload's
     * `display_options`, CA: entities/domain/ui/dns-options.ts:126-146), and the
     * A record as the verification (CA: entities/domain/verify-domain-resolving.ts:245-249).
     * The paid onboarding answers its plan's settings instead.
     *
     * @var array<string, mixed>
     */
    private const array DNS_SETTINGS = [
        'domain_verification' => 'none',
        'valid_cname_addresses' => [],
        'verification_methods' => ['resolve_a_record'],
        'verification_mode' => 'any',
        'display_options' => ['a_records'],
    ];

    public function mode(HostingService $service): string
    {
        return self::SIMPLE;
    }

    public function homeFields(HostingService $service): array
    {
        return [
            'install_method' => 'simple',
            'onboarding_mode' => self::SIMPLE,
            'ask_for_domain' => true,
            'ask_for_site_name' => false,
            'ask_for_wordpress_version' => true,
            'force_install' => false,
            'choose_theme' => false,
            'standard_fields' => [
                'language' => false,
                'database_name' => false,
                'database_prefix' => false,
                'admin_username' => false,
                'admin_email' => false,
                'admin_password' => false,
            ],
            'plan_default_theme' => null,
            'quick_allow_to_choose_themes' => false,
            'is_installed_from_template' => false,
            'standard_force_template' => false,
            'onboarding' => [
                'installation_type' => [
                    'wordpress' => true,
                    'git' => true,
                    'files' => true,
                    // Exposed only for the CA "coming soon" chip (old panel).
                    'go' => true,
                    // WordPress import through the Engine (Engine 2.2.0
                    // Every old method but FTP).
                    'migrations' => true,
                ],
                'user_configurable_options' => [],
                'super_quick_post_installation_action' => 'none',
                'super_quick_ask_for_site_name' => false,
                'ask_for_site_name' => false,
                'super_quick_redirect_delay_after_site_creation' => 0,
                'server_allow_domain_transfer' => false,
                'domain_transfer_enabled' => false,
                'can_select_reseller_user' => false,
                'eager_domain_dns_verification_enabled' => false,
                'dns_settings' => self::DNS_SETTINGS,
                'domains_blacklist' => [],
                // The Engine's sites base domain, which the host reads.
                'subdomain_bases' => null,
                'account_config' => ['memory_limit' => 2048],
            ],
        ];
    }

    public function blockedThemes(HostingService $service): array
    {
        return [];
    }

    public function generatedDomain(HostingService $service, ?string $siteName): ?string
    {
        // Never asked: Community's domain step always asks for a domain.
        return null;
    }

    public function allowsDomain(HostingService $service, string $domain): bool
    {
        return true;
    }

    public function siteName(HostingService $service, ?string $name, array $taken): ?string
    {
        return $name;
    }

    public function allowsProjectType(HostingService $service, string $type): bool
    {
        return true;
    }
}
