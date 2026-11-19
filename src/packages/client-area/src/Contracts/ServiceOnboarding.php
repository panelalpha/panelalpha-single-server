<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Services\HostingService;

/**
 * How a service's plan sets up the onboarding (old `Plan` onboarding methods,
 * packages/api/app/Models/Plan.php:393-427, :500-560, :780-830, :1161-1168,
 * :1319-1338, :1417-1515, :1600-1626, :1684-1693, :1883-1955): the `/home`
 * service keys the Client Area's wizard is gated by (store/store.js:13-28,
 * mixins/Onboarding/SelectedServiceMixin.js:1-103), the mode the install
 * follows, the wordpress.org themes the plan removes, and the domain, site name
 * and project types the onboarding steps accept. Community has no plans: the
 * controller's default answers the simple onboarding with today's values; the
 * paid Admin Area binds the plan's answer.
 */
interface ServiceOnboarding
{
    public const string SIMPLE = 'simple';

    public const string ADVANCED = 'advanced';

    public const string LEGACY_QUICK = 'legacy_quick';

    /** The project types the onboarding creates (old `allowsInstallationType()`, `allowsMigrations()`). */
    public const string TYPE_WORDPRESS = 'wordpress';

    public const string TYPE_GIT = 'git';

    public const string TYPE_FILES = 'files';

    public const string TYPE_MIGRATIONS = 'migrations';

    /**
     * The normalized onboarding mode (old `getWordpressOnboardingMode()`).
     *
     * @return self::SIMPLE|self::ADVANCED|self::LEGACY_QUICK
     */
    public function mode(HostingService $service): string;

    /**
     * The `/home` `user.services[]` keys that come from the plan (old
     * `User::getServicesDetails()`, packages/api/app/Models/User.php:329-366).
     * `onboarding.subdomain_bases` null means "the Engine's sites base domain"
     * (Community's answer, which the host reads from the Engine).
     *
     * @return array{install_method: mixed, onboarding_mode: string, ask_for_domain: bool, ask_for_site_name: bool, ask_for_wordpress_version: bool, force_install: bool, choose_theme: bool, standard_fields: array<string, mixed>, plan_default_theme: mixed, quick_allow_to_choose_themes: mixed, is_installed_from_template: bool, standard_force_template: bool, onboarding: array{installation_type: array<string, bool>, user_configurable_options: list<mixed>, super_quick_post_installation_action: mixed, super_quick_ask_for_site_name: bool, ask_for_site_name: bool, super_quick_redirect_delay_after_site_creation: mixed, server_allow_domain_transfer: bool, domain_transfer_enabled: bool, can_select_reseller_user: bool, eager_domain_dns_verification_enabled: bool, dns_settings: array<string, mixed>, domains_blacklist: list<mixed>, subdomain_bases: list<string>|null, account_config: mixed}}
     */
    public function homeFields(HostingService $service): array;

    /**
     * The wordpress.org theme slugs the plan removes, which the onboarding
     * theme browser leaves out (old `Plan::getThemesToUninstall()`).
     *
     * @return list<string>
     */
    public function blockedThemes(HostingService $service): array;

    /**
     * The domain the onboarding's domain step gives a site whose user was not
     * asked for one (old `DomainController::create()` :150-173 with
     * `Plan::generateSubdomainForQuickInstall()`): a subdomain of the plan's
     * base, or null when the Engine allocates the domain (the old
     * panelalpha.online / sslip fallbacks). Only asked when `homeFields()`'s
     * `ask_for_domain` is false.
     */
    public function generatedDomain(HostingService $service, ?string $siteName): ?string;

    /**
     * Whether the plan lets the onboarding use the domain (old
     * `DomainController::check()` :371-401: the domain and subdomain
     * blacklists).
     */
    public function allowsDomain(HostingService $service, string $domain): bool;

    /**
     * The WordPress site name the install uses (old
     * `InstanceInstallRequest::generateSuperQuickInstallParams()` :117-143):
     * the sent name, a generated one, or null for v1's default (the domain).
     *
     * @param  list<string>  $taken  the site names the user's projects carry
     *
     * @throws ValidationException the plan asks for a name and none was sent
     */
    public function siteName(HostingService $service, ?string $name, array $taken): ?string;

    /**
     * Whether the plan allows creating a project of the type (old
     * `Plan::allowsInstallationType()` / `allowsMigrations()`).
     *
     * @param  self::TYPE_*  $type
     */
    public function allowsProjectType(HostingService $service, string $type): bool;
}
