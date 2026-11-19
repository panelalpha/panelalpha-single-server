<?php

namespace App\Support;

use App\Models\Setting;
use App\Models\User;
use App\Support\Atarim;
use App\Support\SocialProviders;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\File;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\ClientArea\Contracts\HomeAdminBlock;
use PanelAlpha\ClientArea\Contracts\HomeBillingFlags;
use PanelAlpha\ClientArea\Contracts\HomeResellerBranding;
use PanelAlpha\ClientArea\Contracts\UncompletedImports;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Contracts\ServiceDnsEmail;
use PanelAlpha\ClientArea\Services\HostingService;
use PanelAlpha\EngineClient\Api\McpApi;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\ClientArea\Jobs\Sync\SyncEnginesJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\ClientArea\Contracts\CommunityPanel;
use PanelAlpha\ClientArea\Contracts\HubLogin;
use PanelAlpha\ClientArea\Contracts\HubPairingStatus;
use PanelAlpha\ClientArea\Contracts\SetupState;
use PanelAlpha\ClientArea\Support\DateFormats;

/**
 * The /home payload the Client Area boots from. A guest gets
 * the public part of the `app` block only; a signed-in user the whole
 * `app` block and the `user` envelope, with the one "virtual service" the
 * single-server CA works with (Community is a single-server panel with a single
 * Engine, so the panel presents exactly one service whose hosting accounts are
 * the Engine projects).
 *
 * Kept in the host app because it describes the panel itself (settings, users,
 * the single server), not one application; it resolves the Engine through the
 * edition contracts, never directly.
 */
final class HomePayload
{
    /** Effectively unlimited plan: the panel sells no plans in Community. */
    private const INSTANCE_LIMIT = PHP_INT_MAX;

    private const DEFAULT_NAME = 'My Server';

    /** The theme without a saved branding (old `BrandingSetting::getDefaultTheme()`). */
    private const DEFAULT_THEME = [
        'colors' => [
            'base' => '#07C07E',
            'lighten1' => '#1FD895',
            'lighten2' => '#CDF2E5',
            'lighten4' => '#E6F9F2',
            'darken1' => '#0AAA71',
        ],
        'style' => [
            'disableShadows' => false,
            'darkMode' => false,
            'darkUserChangeMode' => true,
        ],
        'logo' => false,
        'darkLogo' => false,
        'favicon' => false,
    ];

    public function __construct(
        private readonly ApplicationRepository $applications,
        private readonly EngineSystemInfo $system,
        private readonly ApplicationSynchronizer $synchronizer,
        private readonly EngineResolver $engines,
        private readonly EngineRunningTasks $runningTasks,
        private readonly ServiceDirectory $services,
        private readonly HomeAdminBlock $adminBlock,
        private readonly UncompletedImports $uncompletedImports,
        private readonly SetupState $setup,
        private readonly CommunityPanel $communityPanel,
        private readonly HubLogin $hubLogin,
        private readonly HubPairingStatus $hubPairingStatus,
        private readonly HomeBillingFlags $billingFlags,
        private readonly HomeResellerBranding $resellerBranding,
        private readonly ServiceOnboarding $onboarding,
        private readonly ServiceDnsEmail $dnsEmail,
    ) {}

    /**
     * A visitor who is not signed in gets {@see guestApp()} only; the rest of
     * the `app` block and the `user` block need a session.
     *
     * @return array{app: array<string, mixed>, user?: array<string, mixed>, admin?: array<string, mixed>}
     */
    public function build(?User $user = null): array
    {
        $user ??= Auth::user();

        if (! $user instanceof User) {
            return ['app' => $this->guestApp()];
        }

        $app = $this->app();
        // A user who never chose keeps the panel theme's default (old
        // AuthController::home(): `dark_mode ?? branding darkMode`, read
        // before a reseller's theme replaces the panel's).
        $darkMode = $user->dark_mode ?? self::themeDarkMode($app);
        // A reseller's or a sub-user's brand (none in Community).
        $branded = $this->resellerBranding->forUser($user, $app);
        $data = ['app' => self::setDarkMode($branded['app'], $darkMode)];
        $data['user'] = $this->user($user, $branded['reseller_settings']);

        // The admin who signed in as this user (never in Community).
        $admin = $this->adminBlock->forCurrentSession();
        if ($admin !== null) {
            $data['admin'] = $admin;
        }

        return $data;
    }

    /**
     * The `app` block for a visitor who is not signed in: what the SPA
     * shell, the login and sign-up pages and the first-run wizard read before
     * a session exists. No Engine state, pairing or task flags.
     *
     * @return array<string, mixed>
     */
    public function guestApp(): array
    {
        return [
            ...$this->publicApp($this->billingFlags->flags()),
            // Only a guest can be in first-run setup; an authenticated /home
            // runs no `users` query (the SQL pin in Legacy/User/HomeTest).
            'setup_required' => $this->setup->required(),
            // The account from the delivered first-user variables could not be
            // created: the wizard stays closed and the login page says what to
            // fix (SetupState::blocked(), the Community package's answer).
            'setup_blocked' => $this->setup->blocked(),
        ];
    }

    /**
     * The signed-in user's `app` block: {@see publicApp()} plus the panel's
     * links, integrations, the single server's task and import flags, the
     * Hub pairing and the MCP URL.
     *
     * @return array<string, mixed>
     */
    public function app(): array
    {
        $billing = $this->billingFlags->flags();

        return [
            ...$this->publicApp(
                $billing,
                integrations: [
                    'report_provider_enabled' => true,
                    'preview_site_provider_enabled' => false,
                    'atarim_enabled' => Atarim::isEnabled(),
                ],
                singleServer: [
                    'server_id' => null,
                    'has_running_tasks' => $this->hasRunningTasks(),
                    'has_uncompleted_imports' => $this->uncompletedImports->exists(),
                ],
            ),
            'documentation_link' => Setting::get('system.documentation-link'),
            'order_custom_ssl_certificate_link' => Setting::get('system.order-ssl-certificate-link'),
            'page_speed_enabled' => false,
            'upload_max_bytes' => Payload::int(config('client-area.upload_max_bytes')) ?? 268435456,
            // Billing: none in Community, the paid Admin Area's
            // background-billing settings otherwise.
            'billing_enabled' => $billing['billing_enabled'],
            'beta_mode' => false,
            // First-run wizard flag: a signed-in user is past it.
            'setup_required' => false,
            // The Community menu reminder to pair with PanelAlpha Hub (UserInfoDropdown.vue).
            'hub_paired' => $this->hubPairingStatus->paired(),
            // Connect AI server URL: read from the Engine's system info.
            // The CA currently builds its own URL client-side
            // (ConnectAi.vue:150-153), so this is the documented source of truth.
            'mcp_url' => $this->mcpUrl(),
        ];
    }

    /**
     * The fields a guest and a user share: branding, languages, custom code,
     * the sign-up flags, the social providers and the login page's
     * "Sign in with PanelAlpha". {@see app()} adds its own `integrations` and
     * `single_server` keys.
     *
     * @param  array{billing_enabled: bool, registration_enabled: bool, registration_tos: string|null, recaptcha_site_key: string|null, from_control_panel_registration: array{tos: string|null}}  $billing
     * @param  array<string, mixed>  $integrations
     * @param  array<string, mixed>  $singleServer
     * @return array<string, mixed>
     */
    private function publicApp(array $billing, array $integrations = [], array $singleServer = []): array
    {
        $languages = self::languages();

        return [
            'name' => self::nonEmpty(Setting::get('userapp.name', self::DEFAULT_NAME), self::DEFAULT_NAME),
            'default_language' => self::nonEmpty(Setting::get('userapp.default-language', 'en'), 'en'),
            'default_date_format' => DateFormats::normalize(Setting::get('userapp.default-date-format')),
            'support_link' => Setting::get('system.support-link'),
            'languages' => $languages,
            'language_flags' => self::languageFlags($languages),
            'custom_js_header' => Setting::get('userapp.custom-js-header'),
            'custom_js_footer' => Setting::get('userapp.custom-js-footer'),
            'custom_css' => Setting::get('userapp.custom-css'),
            // Sign-up: the login page's link, the terms and
            // the reCAPTCHA key of the sign-up page.
            'registration_enabled' => $billing['registration_enabled'],
            'registration_tos' => $billing['registration_tos'],
            'recaptcha_site_key' => $billing['recaptcha_site_key'],
            'from_control_panel_registration' => $billing['from_control_panel_registration'],
            'integrations' => [
                // The login page's social buttons.
                'auth' => SocialProviders::enabled(),
                ...$integrations,
            ],
            // The Community pages (Tasks, Settings) instead of the Admin Area link
            // (community in single-user mode; false in the paid product);
            // the setup guard reads it before sign-in.
            'community_panel' => $this->communityPanel->active(),
            // "projects" rather than "instances" in paths and texts, also on
            // the login page.
            'single_server' => [
                'active' => true,
                ...$singleServer,
            ],
            // "Sign in with PanelAlpha" on the login page (Login.vue:547-548):
            // the Community panel once paired with PanelAlpha Connect (community).
            // The button needs it before sign-in, so a guest learns whether
            // the panel is paired.
            'hub_login' => $this->hubLogin->available(),
            'theme' => self::theme(),
        ];
    }

    /**
     * The Client Area theme (old `BrandingSetting::getUserAppTheme()`): the
     * branding the paid Admin Area saves as the `userapp.branding` setting
     * (the wizard's branding step, the StyleManager after "login as user"),
     * without its PNG logo copy; else the default. Community never writes the
     * setting, so it always gets the default.
     *
     * @return array<string, mixed>
     */
    private static function theme(): array
    {
        $theme = Payload::object(json_decode(Setting::get('userapp.branding') ?? '', true));
        if ($theme === []) {
            return self::DEFAULT_THEME;
        }
        unset($theme['logo_png']);

        return $theme;
    }

    /**
     * @param  array<string, mixed>|null  $resellerSettings  the reseller's own settings, else null
     * @return array<string, mixed>
     */
    public function user(User $user, ?array $resellerSettings = null): array
    {
        $language = self::nonEmpty($user->language ?? null, self::nonEmpty(Setting::get('userapp.default-language'), 'en'));

        return [
            'email' => $user->email,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'name' => $user->name,
            'company_name' => $user->company_name,
            'language' => $language,
            'dark_mode' => (bool) $user->dark_mode,
            'gravatar_hash' => $user->gravatarHash(),
            'two_factor_auth_enabled' => $user->hasEnabledTwoFactorAuthentication(),
            'new_device_detection' => self::nonEmpty($user->new_device_detection, 'ip, device, browser'),
            'services' => $this->services($user),
            'reseller_settings' => $resellerSettings,
            'is_ss_default' => true,
            'order_service_link' => null,
            'service_unsuspend_link' => null,
            'order_domain_link' => null,
            'has_hosting_access' => true,
            'password_change_required' => (bool) $user->password_change_required,
            'password_generated' => (bool) $user->password_generated,
            // Community has no admin-forced 2FA window (old panel's two_factor_required_at).
            'two_factor_auth_required' => false,
        ];
    }

    /**
     * The MCP server URL the panel actually proxies to: derived from `engine-api-url`'s origin plus the Engine's `/mcp` path,
     * or the `engine-mcp-url` override. No Engine call and no cache read, so
     * `/home` still never blocks on the Engine; an unconfigured Engine (or an
     * unusable URL) leaves the field null.
     */
    private function mcpUrl(): ?string
    {
        try {
            return (new McpApi($this->engines->forEngine(EngineConnection::DEFAULT_ID), Payload::nullableString(config('client-area.mcp_url'))))->mcpUrl();
        } catch (EngineException) {
            return null;
        }
    }

    /**
     * A configured value that may be null or empty falls back to the old default.
     */
    private static function nonEmpty(mixed $value, string $default): string
    {
        return is_string($value) && $value !== '' ? $value : $default;
    }

    /**
     * @param  array<string, mixed>  $app
     * @return array<string, mixed>
     */
    private static function setDarkMode(array $app, mixed $darkMode): array
    {
        $theme = self::optionalObject($app['theme'] ?? null) ?? [];
        $style = self::optionalObject($theme['style'] ?? null) ?? [];
        $style['darkMode'] = Payload::bool($darkMode) ?? false;
        $theme['style'] = $style;
        $app['theme'] = $theme;

        return $app;
    }

    /**
     * @param  array<string, mixed>  $app
     */
    private static function themeDarkMode(array $app): bool
    {
        $theme = self::optionalObject($app['theme'] ?? null) ?? [];

        return (bool) (self::optionalObject($theme['style'] ?? null)['darkMode'] ?? false);
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function optionalObject(mixed $value): ?array
    {
        return is_array($value) ? Payload::object($value) : null;
    }

    /**
     * The user's hosting services ({@see ServiceDirectory}): Community's one
     * synthetic service, a paid edition's real ones.
     *
     * @return list<array<string, mixed>>
     */
    private function services(User $user): array
    {
        try {
            // /home never blocks on the Engine: read the
            // local mirror only and let the scheduler refresh it.
            $applications = $this->applications->forUser($user, refresh: false);
        } catch (EngineException $e) {
            // The CA must still boot without the Engine; hosting pages then
            // show an empty service rather than failing /home.
            report($e);
            $applications = collect();
        }

        // "Never synced" = no successful sync() recorded for the Engine (not
        // "no projects"): queue one, never sync inline.
        if (! $this->synchronizer->hasSynced(EngineConnection::DEFAULT_ID)) {
            SyncEnginesJob::dispatch()->onConnection('database');
        }

        $all = array_values($applications->all());
        $services = [];
        foreach ($this->services->forUser($user) as $service) {
            $services[] = $this->service($service, $this->services->applicationsOf($service, $all));
        }

        return $services;
    }

    /**
     * One service in the old `/home` shape.
     *
     * @param  list<Application>  $serviceApplications  the service's projects
     * @return array<string, mixed>
     */
    private function service(HostingService $service, array $serviceApplications): array
    {
        $applications = collect($serviceApplications);

        $hostingAccounts = $applications
            ->reject->isStaging()
            ->map(fn (Application $app) => $this->hostingAccount($service, $app))
            ->values()
            ->all();

        $liveCount = $applications
            ->reject->isStaging()
            ->where('status', 'active')
            ->count();

        $ipv4 = collect($hostingAccounts)
            ->flatMap(fn ($account) => $account['ipv4_addresses'])
            ->unique()
            ->values()
            ->all();

        if ($ipv4 === []) {
            $ipv4 = $this->system->ipv4Addresses();
        }

        // The wizard's gate and steps: Community's
        // simple onboarding, the plan's in the paid product.
        $onboarding = $this->onboarding->homeFields($service);
        $steps = $onboarding['onboarding'];
        // Free offers a free subdomain of the Engine's sites base; a plan names
        // its own bases (old `getDomainsForSubdomains()`).
        $steps['subdomain_bases'] ??= [$this->system->sitesBaseDomain() ?? 'panelalpha.online'];

        // The old `/home` service payload has no `privileges` key; the CA reads
        // them from `/services`.
        return [
            'id' => $service->id,
            'plan_id' => null,
            'plan_name' => $service->planName,
            'instance_limit' => $service->projectLimit ?? self::INSTANCE_LIMIT,
            'instance_count' => $liveCount,
            'hosting_accounts' => $hostingAccounts,
            'install_method' => $onboarding['install_method'],
            'onboarding_mode' => $onboarding['onboarding_mode'],
            'ask_for_domain' => $onboarding['ask_for_domain'],
            'ask_for_site_name' => $onboarding['ask_for_site_name'],
            'ask_for_wordpress_version' => $onboarding['ask_for_wordpress_version'],
            'force_install' => $onboarding['force_install'],
            'choose_theme' => $onboarding['choose_theme'],
            'standard_fields' => $onboarding['standard_fields'],
            'status' => 'active',
            // The trial's "Upgrade" (CA: views/Billing.vue:215-220).
            'plan_upgrade_link' => $service->upgradeLink,
            'plan_default_theme' => $onboarding['plan_default_theme'],
            'quick_allow_to_choose_themes' => $onboarding['quick_allow_to_choose_themes'],
            'is_installed_from_template' => $onboarding['is_installed_from_template'],
            'standard_force_template' => $onboarding['standard_force_template'],
            'onboarding' => $steps,
            // The onboarding's DNS verification: the service's
            // DNS server in the paid product, none in Community.
            'dns_server' => $this->dnsEmail->dnsServer($service),
            'hosting_server' => [
                'ip_v4_addresses' => $ipv4,
            ],
            'is_trial' => $service->isTrial,
            'trial_expiry_at' => $service->trialExpiresAt,
        ];
    }

    /**
     * A hosting account is the panel's view of one Engine project. The id is
     * the local applications.id (what /server-accounts/{id} and
     * /projects/{id} both use).
     *
     * @return array{id: int, service_id: int, domain: string|null, details: array<string, mixed>, status: string, host_c_names: mixed, ipv4_addresses: list<string>}
     */
    private function hostingAccount(HostingService $service, Application $app): array
    {
        $payload = $app->engine_payload ?? [];
        $details = self::optionalObject($payload['details'] ?? null) ?? [];
        $config = self::optionalObject($payload['config'] ?? null) ?? [];

        return [
            'id' => $app->id,
            'service_id' => $service->id,
            // The old `www.`-less domain.
            'domain' => $app->presentedDomain(),
            'details' => $details,
            'status' => $app->status,
            'host_c_names' => $details['host_c_names'] ?? [],
            'ipv4_addresses' => $this->accountIpv4($config),
        ];
    }

    /**
     * @param  array<string, mixed>  $config  Engine project config
     * @return list<string>
     */
    private function accountIpv4(array $config): array
    {
        return Payload::strings(Payload::object($config['ip_addresses'] ?? null)['ipv4'] ?? null);
    }

    /**
     * Language folders under resources/lang (old Language helper). Public so
     * the account endpoints validate `language` against the same list.
     *
     * @return list<string>
     */
    public static function languages(): array
    {
        $languages = [];
        foreach (Payload::strings(File::directories(resource_path('lang'))) as $directory) {
            $languages[] = basename($directory);
        }

        return $languages;
    }

    /**
     * Public so the panel-language contract sends the same flags
     * (PanelLanguageList).
     *
     * @param  list<string>  $languages
     * @return array<string, string>
     */
    public static function languageFlags(array $languages): array
    {
        $flags = [];

        foreach ($languages as $code) {
            $metaPath = resource_path("lang/{$code}/meta.php");
            if (! File::exists($metaPath)) {
                continue;
            }

            $meta = self::optionalObject(File::getRequire($metaPath));
            if ($meta === null) {
                continue;
            }

            $flag = Payload::nullableString($meta['flag'] ?? null);

            if ($flag !== null && preg_match('/^[A-Z]{2}$/', strtoupper($flag))) {
                $flags[$code] = strtoupper($flag);
            }
        }

        return $flags;
    }

    /**
     * Whether any Engine task is still running, so the admin-area menu shows
     * its badge (single_server.has_running_tasks). `/home` reads only the cache
     * the scheduler fills from `GET /tasks`; an
     * unreachable Engine answers false.
     */
    private function hasRunningTasks(): bool
    {
        return $this->runningTasks->get();
    }
}
