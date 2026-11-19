<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;
use PanelAlpha\ClientArea\Access\Privileges;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\DiagnosticMode;
use PanelAlpha\ClientArea\Events\ProjectListPresented;
use PanelAlpha\ClientArea\Events\ProjectListPresenting;
use PanelAlpha\ClientArea\Http\Presenters\WordPress\ImportDetailsPresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\ApplicationLabel;
use PanelAlpha\ClientArea\Models\WordPressAsyncStatus;
use PanelAlpha\ClientArea\Projects\DeployState;
use PanelAlpha\ClientArea\Projects\StackDetector;
use PanelAlpha\ClientArea\Projects\StagingService;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\MeasuredBandwidth;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Contracts\ServerIpv4Addresses;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Contracts\ServiceDnsEmail;
use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Contracts\ProjectLimits;
use PanelAlpha\ClientArea\Contracts\ProjectSharing;

/**
 * Builds the project item the Client Area expects (the old panel's
 * InstanceResource shape) from a local Application row and the last Engine payload.
 *
 * Values come from the mirror's `engine_payload` (details, config, domain_names)
 * – never a live Engine call – so lists stay one query.
 *
 * `id` and `server_account_id` are both the local Application id: in
 * single-server the CA's "server account" is the same Engine project.
 */
final class ProjectPresenter
{
    public function __construct(
        private readonly AccessResolver $access,
        private readonly DeployState $deploys,
        private readonly ServiceDirectory $services,
        private readonly DiagnosticMode $diagnosticMode,
        private readonly ImportDetailsPresenter $imports,
        private readonly ProjectSharing $sharing,
        private readonly ServiceDnsEmail $dnsEmail,
        private readonly Dispatcher $events,
        private readonly ServiceOnboarding $onboarding,
        private readonly ProjectLimits $limits,
        private readonly ServerIpv4Addresses $serverIps,
    ) {}

    /**
     * @param  EloquentCollection<int, Application>  $applications
     * @return list<array<string, mixed>>
     */
    public function presentList(EloquentCollection $applications, Authenticatable $user): array
    {
        // Labels are read directly: one label query for the whole list.
        $applications->loadMissing(['applicationLabels', 'wordpressAsyncStatuses', 'wordpressInstall', 'wordpressImport', 'stagingOf']);
        $stagingsByParent = $applications->filter->isStaging()->groupBy('staging_of_id');

        // The edition's per-project lookups (service, owner, shares, servers)
        // are batched for the whole list.
        $this->events->dispatch(new ProjectListPresenting($applications, $user));
        try {
            /** @var list<array<string, mixed>> $items */
            $items = $applications
                ->reject->isStaging()
                ->map(fn (Application $app) => $this->present($app, $user, $stagingsByParent->get($app->id, collect())))
                ->values()
                ->all();
        } finally {
            $this->events->dispatch(new ProjectListPresented);
        }

        return $items;
    }

    /**
     * The project right after the panel started its install deploy (retry-install):
     * the Engine may not have started the deploy yet, so its newest deploy is
     * still the failed one, while the CA must follow the new one
     * (`OnboardingModalWrapper.vue:1654-1656` replaces the item with this
     * answer) – the installation is `in_progress` by definition.
     *
     * @return array<string, mixed>
     */
    public function presentInstalling(Application $app, Authenticatable $user): array
    {
        $item = $this->present($app, $user);
        $async = Payload::object($item['async_status'] ?? null);
        $async['installation'] = DeployState::INSTALL_IN_PROGRESS;
        $item['async_status'] = $async;

        return $item;
    }

    /**
     * @param  Collection<int, Application>|null  $stagings  null = load from the relation
     * @return array<string, mixed>
     */
    public function present(Application $app, Authenticatable $user, ?Collection $stagings = null, int $depth = 0): array
    {
        /** @var Collection<int, Application> $noStagings */
        $noStagings = new Collection;

        $payload = $app->engine_payload ?? [];
        $details = Payload::object($payload['details'] ?? null);
        // The Engine's error text names home/system paths; the detail page must
        // not leak the raw `/home/…` text either.
        if (isset($details['error']) && is_string($details['error'])) {
            $details['error'] = EngineText::sanitize($details['error']);
        }
        // The DNS badge's dismiss flag is the panel's (old
        // `details.dns_alerts_enabled`, default true; `Instances.js:441`).
        $details['dns_alerts_enabled'] = $app->dns_alerts_enabled !== false;
        $config = Payload::object($payload['config'] ?? null);
        $service = $this->services->ofApplication($app);
        // The service's DNS and e-mail servers and the project's zone (none
        // in Community).
        $servers = $this->dnsEmail->projectFields($app, $service);

        $stagings ??= $app->isStaging() ? $noStagings : $app->stagings;
        if ($stagings instanceof EloquentCollection) {
            $stagings->loadMissing(['applicationLabels', 'wordpressAsyncStatuses', 'wordpressInstall', 'wordpressImport']);

            // Hand the parent down so a staging's push mapping needs no query.
            if (! $app->isStaging()) {
                $stagings->each->setRelation('stagingOf', $app);
            }
        }

        // A detail page must not query per app or staging: load everything the
        // presenter reads up front. The installation state is
        // the Engine's and queries nothing.
        $app->loadMissing(['applicationLabels', 'wordpressAsyncStatuses', 'wordpressInstall', 'wordpressImport']);

        // A staging's push state is derived from its parent (V5d); one query is
        // fine on a detail page, and lists loaded the relation up front.
        if ($app->isStaging()) {
            $app->loadMissing('stagingOf');
        }

        $domain = (string) ($app->domain ?? '');
        $name = StagingService::displayName($app);
        $status = $app->status;
        $createdAt = $app->engine_created_at?->toJSON() ?? Payload::nullableString($payload['created_at'] ?? null);

        $domainNames = Payload::strings($payload['domain_names'] ?? null);
        $ipv4 = $this->ipv4($config);
        $git = $this->gitRepository($app, $details);
        // Raw Engine details (before the sanitised `error` / dns flag) feed the
        // shared homedir / mysql prefix / ip derivation.
        $accountDerived = $this->accountDerived($app, $config, Payload::object($payload['details'] ?? null), $ipv4);

        $appType = $this->appType($app, Payload::object($payload));
        $sharing = $this->sharing->describe($app, $user);
        // The records and the verification the domain dialogs show are the
        // service's (old `InstanceResource::getDnsVerificationSettings()`): the
        // plan's in the paid editions, the single server's A record here.
        $dnsSettings = Payload::object(Payload::object($this->onboarding->homeFields($service)['onboarding'] ?? null)['dns_settings'] ?? null);

        return [
            'id' => $app->id,
            'type' => $appType,
            'app_type' => $appType,
            'source' => $this->source($app, $details),
            'name' => $name,
            // The old `www.`-less domain; `url` keeps the host the Engine serves.
            'domain' => (string) ($app->presentedDomain() ?? ''),
            'url' => $domain !== '' ? 'https://'.$domain : '',
            'status' => $status,
            'created_at' => $createdAt,
            'staging' => $app->staging_of_id,
            'staging_apps' => $stagings->map(fn (Application $staging) => $this->present($staging, $user, $noStagings, $depth + 1))->values()->all(),
            // A staging instance carries its parent, recursion-guarded (the
            // CA builds the staging top bar and modals from it).
            'parent_app' => $this->parentApp($app, $user, $depth),
            'version' => null,
            // Who owns it and who it is shared with: the
            // edition's answer; Community's is `true`, `null`, `[]`.
            'owned' => $sharing['owned'],
            'owner' => $sharing['owner'],
            'shared_access' => $sharing['shared_access'],
            'labels' => $this->labels($app),
            'ssl_order_status' => 'none',
            'cdn_enabled' => false,
            'cdn_dns_records' => [],
            // Nothing checked yet: the CA probes the certificate the domain
            // serves only when this is an object, and a null left every
            // project's padlock red (CA: components/security/DnsSslIndicator.vue:402-420).
            // The Engine has no detected certificate of its own to fill it with.
            'domain_ssl_details' => [
                'installed_ssl_cert' => null,
                'installed_ssl_cert_checked_time' => null,
                'detected_ssl_cert' => null,
                'detected_ssl_cert_checked_time' => null,
            ],
            // The zone named after the project's domain on the service's DNS
            // server (old `Domain::findZone(true)`).
            'domain_zone' => $servers['domain_zone'],
            'domain_has_dns_zone' => $servers['domain_has_dns_zone'],
            // The document root is a **domain** detail on the Engine, not a
            // project one; no Engine key invents it here.
            'dir' => null,
            'privileges' => Privileges::forProject($this->access->privileges($user, $app), $app),
            'service_id' => $service->id,
            'service_status' => $status,
            'service_is_trial' => $service->isTrial,
            'service_trial_expiry_at' => $service->trialExpiresAt,
            'service_created_at' => $createdAt,
            'server_account_id' => $app->id,
            'server_account_status' => $status,
            'server_account_details' => array_merge($details, $accountDerived),
            'plans.name' => $service->planName,
            'hosting_server_type' => 'panelalpha',
            'screenshot_time' => $app->screenshotTime(),
            // Storage and bandwidth from the synced project's `disk` and
            // `bandwidth`.
            'stats' => $this->stats($payload),
            // Usage, disk, the six limits and their ceilings (project-usage).
            'resources' => $this->resources($app),
            'details' => $details,
            'is_container' => $app->isContainer(),
            'theme_details' => null,
            // The Engine returns no Lighthouse scores on the project; the panel
            // stores the screenshot only.
            'performance_score' => [
                'desktop' => null,
                'mobile' => null,
            ],
            'backup_details' => [],
            'plugin_details' => [],
            // Unknown: the schedule is one Engine call per project and a list
            // must not make them. The project page asks for it and sets this
            // (CA: mixins/AutomaticBackupsSettingsFetchMixin.js:24).
            'has_automatic_backup' => null,
            'automatic_backup_count' => 0,
            'needs_recent_backup_warning' => false,
            'needs_backup_attention' => false,
            'automatic_backups_editable' => $service->automaticBackupsEditable,
            'service_has_dns' => $servers['service_has_dns'],
            // The Cloudflare page's gate
            // (CA: components/AdvancedPagesSidebar.vue:36-41).
            'service_has_dns_cloudflare' => $servers['service_has_dns_cloudflare'],
            'service_has_email' => $servers['service_has_email'],
            // Panel-owned installation state from the deploy history;
            // the Engine's async_status has no `installation`.
            'install_details' => null,
            // A WordPress import's steps and progress (Engine 2.2.0);
            // null for every other project, which the CA reads as "not an
            // import" (`InstanceAvatar.vue:226-228`).
            'import_details' => $app->wordpressImport === null ? null : $this->imports->present($app->wordpressImport),
            // The panel's diagnostic mode (the paid edition's health checks,
            // `DiagnosticMode`; never in Community): the instance's own or its
            // hosting account's, as the old `InstanceResource`. The CA disables
            // its actions on it (views/instance/index.vue:289); the backend
            // never refused them (old `HealthCheck::validateEntity()` guarded
            // only the control-panel SSO, which v1 does not have).
            'diagnostic_mode' => $this->diagnosticMode->blockedEntity($app) !== null,
            'async_status' => $this->asyncStatus($app, $details, $stagings),
            'server_settings' => [
                'domain_transfer_allowed' => false,
                // The panel runs the schedule itself (Engine `backup-schedule`):
                // true hid the Automatic Backups switch (CA: views/instance/Backups.vue:24).
                'uses_own_backup_system' => false,
                'is_staging_billable' => false,
                'force_separate_accounts' => false,
            ],
            'plan_settings' => [
                'dns_management_enabled' => $servers['dns_management_enabled'],
                'copy_instance_allowed' => true,
                'domain_transfer_enabled' => false,
                'cdn' => ['provider_slug' => 'none'],
                'domain_for_staging' => ['type' => 'subdomain_of_site_domain', 'fixed_domain' => ''],
                'onboarding' => ['has_external_wordpress_builder' => false],
                'eager_domain_dns_verification_enabled' => false,
                'convert_nested_subdomains_for_staging' => false,
                'wordpress_mcp_enabled' => false,
            ],
            'plan_name' => $service->planName,
            // Old `InstanceResource:151` (CA: components/cards/details/SiteDetailsCard.vue:173).
            'plan_upgrade_link' => $service->upgradeLink,
            'dns_settings' => $dnsSettings,
            'onboarding_subdomain' => null,
            'host_ip_address' => $ipv4[0] ?? null,
            'host_ipv4_addresses' => $ipv4,
            // The Engine names the project's host names `domain_names` and has
            // no nameservers of its own: the nameservers are the
            // service's DNS server's (none in Community).
            'host_c_names' => $domainNames,
            'dns_nameservers' => $servers['dns_nameservers'],
            'service_nameservers' => $servers['service_nameservers'],
            // CA: InstanceTopBarTabs.vue:208-213 reads `report_provider.status` on
            // every project with the Monitoring tab, so a null here throws and
            // drops the whole tab bar. The panel's reports come from the Engine,
            // with no tracking code to check: the old answer for that case
            // (old `Application::getReportProviderHealthCheck()`,
            // packages/api/app/Models/Application.php:2040-2046).
            'health_checks' => ['report_provider' => ['status' => 'not_applicable']],
            'can_auto_updates' => ['wordpress' => true],
            'git_repository' => $git,
            'supports_admin_sso' => $appType === Application::TYPE_WORDPRESS,
            'temp_url' => null,
            'preview_site' => null,
        ];
    }

    /**
     * The top-level keys a websocket notification carries.
     *
     * A whitelist, not a blacklist: the CA's `instanceResource` reads only
     * these and the Echo handlers read `id`, `staging`, `version`,
     * `server_account_id`; the heavy keys (`details`, `server_account_details`,
     * `staging_apps`) are handled separately. Anything added to the full
     * payload later stays out of the socket unless it is listed here.
     *
     * @var list<string>
     */
    private const BROADCAST_KEYS = [
        'id', 'type', 'app_type', 'source', 'name', 'domain', 'url', 'status',
        'created_at', 'staging', 'version', 'owned', 'owner', 'shared_access',
        'labels', 'ssl_order_status', 'dir', 'privileges', 'service_id',
        'service_status', 'service_is_trial', 'service_trial_expiry_at',
        'service_created_at', 'server_account_id', 'server_account_status',
        'plans.name', 'hosting_server_type', 'screenshot_time', 'stats',
        'theme_details', 'performance_score', 'backup_details', 'plugin_details',
        'has_automatic_backup', 'automatic_backup_count',
        'needs_recent_backup_warning', 'needs_backup_attention',
        'automatic_backups_editable', 'service_has_dns',
        'service_has_dns_cloudflare', 'service_has_email', 'install_details',
        'import_details', 'diagnostic_mode', 'async_status', 'server_settings',
        'plan_settings', 'plan_name', 'plan_upgrade_link', 'dns_settings',
        'onboarding_subdomain', 'host_ip_address', 'host_ipv4_addresses',
        'host_c_names', 'dns_nameservers', 'service_nameservers', 'health_checks',
        'can_auto_updates', 'git_repository', 'supports_admin_sso', 'temp_url',
        'preview_site', 'is_container',
    ];

    /**
     * The reduced instance a websocket notification carries.
     *
     * The full payload is 24–33 KB for a staging/push: a staging embeds its
     * parent (with the parent's stagings) and the Engine `details` map is sent
     * twice (`details` and `server_account_details`), past the ~10 KB
     * Pusher/Reverb cap, so the broadcast was dropped. Keep the keys the CA's
     * Echo handlers read and the keys `instanceResource` needs to rebuild the
     * row without throwing (`url` at Instances.js:144, `server_settings` at
     * Instances.js:318); the staging retry modal also reads the parent's
     * `plan_settings`. The database copy still stores the full payload
     * (`toArray`).
     *
     * @return array<string, mixed>
     */
    public function presentSlim(Application $app, Authenticatable $user): array
    {
        $full = $this->present($app, $user, new Collection);

        /** @var array<string, mixed> $slim */
        $slim = array_intersect_key($full, array_flip(self::BROADCAST_KEYS));

        // The Engine details map is the remaining bulk and is exposed twice;
        // no Echo handler or instanceResource reads it from a notification.
        $slim['details'] = [];
        /** @var array<array-key, mixed> $account */
        $account = is_array($full['server_account_details'] ?? null) ? $full['server_account_details'] : [];
        $slim['server_account_details'] = array_intersect_key(
            $account,
            array_flip(['homedir', 'mysql_db_prefix', 'ip_address', 'username']),
        );

        // A staging inside its parent and the parent inside the staging would
        // each embed the other's full payload; keep the parent only as a slim
        // object the CA's CreateStagingModal can still open.
        $slim['staging_apps'] = [];
        $parent = $app->isStaging() ? $app->stagingOf : null;
        $slim['parent_app'] = $parent instanceof Application ? $this->presentSlim($parent, $user) : null;

        return $slim;
    }

    private static function repoPath(string $repoUrl): string
    {
        $path = parse_url($repoUrl, PHP_URL_PATH);

        return is_string($path) && $path !== '' ? $path : $repoUrl;
    }

    /**
     * The project's labels in the CA shape (`title`, `color`), read from the
     * relation the callers loaded up front (formerly through the
     * `ProjectFacets` seam).
     *
     * @return list<array{title: string, color: string}>
     */
    private function labels(Application $app): array
    {
        return array_values($app->applicationLabels
            ->map(static fn (ApplicationLabel $label): array => ['title' => $label->title, 'color' => $label->color])
            ->all());
    }

    /**
     * The CA `stats` tiles (CA `Instances.js:146-183`: a falsy
     * `usage` shows `-`, a null `maximum` `∞`, a null block `-` everywhere).
     *
     * Storage is the Engine's stored measurement on the project resource
     * (`disk`, `UserResource::disk()`): `total_bytes`, and `limit_bytes` with
     * -1 for unlimited since Engine 2.2.0 (null before it; both become null,
     * `Payload::limit()`), both already bytes. It is mirrored by the sync, so
     * every list and page reads it without an Engine call. Bandwidth is the
     * Engine's measurement of this calendar month on the same resource
     * (`bandwidth`, Engine 2.2.0; {@see MeasuredBandwidth}), also
     * mirrored, so no page reads `E:/usage` live any more; `{usage: null,
     * maximum: null}` until the Engine measured it. The block is null when
     * there is neither measurement.
     *
     * @param  array<string, mixed>  $payload  the mirrored Engine project
     * @return array<string, mixed>|null
     */
    private function stats(array $payload): ?array
    {
        $bandwidth = MeasuredBandwidth::of($payload);
        if (! is_array($payload['disk'] ?? null) && $bandwidth === null) {
            return null;
        }

        $disk = Payload::object($payload['disk'] ?? null);

        return [
            'storage' => [
                'usage' => Payload::int($disk['total_bytes'] ?? null),
                'maximum' => Payload::limit($disk['limit_bytes'] ?? null),
            ],
            'bandwidth' => $bandwidth ?? ['usage' => null, 'maximum' => null],
            // The Engine has no AWStats visitors on the project; the old
            // InstanceResource defaulted the key to [] (CA reads .visitors.unique).
            'visitors' => [],
        ];
    }

    /**
     * The `resources` block of the project page: the latest usage sample, the
     * disk measurement, the six limits a client may change and their ceilings,
     * all raw (bytes, MB, cores; -1 is unlimited, null is not set). Read from
     * the mirrored Engine project, so no Engine call; null for a project the
     * sync has not mirrored yet.
     *
     * @return array{usage: array<string, mixed>|null, disk: array<string, mixed>|null, limits: array<string, int|float|null>, ceilings: array<string, int|float|null>}|null
     */
    public function resources(Application $app): ?array
    {
        $payload = $app->engine_payload;
        if (! is_array($payload) || $payload === []) {
            return null;
        }

        // `usage` is null when the Engine's last sample is older than 5 minutes.
        $usage = is_array($payload['usage'] ?? null) ? Payload::object($payload['usage']) : null;
        $disk = is_array($payload['disk'] ?? null) ? Payload::object($payload['disk']) : null;
        $config = Payload::object($payload['config'] ?? null);
        $ceilings = $this->limits->ceilings($app);

        $limits = [];
        $ceilingValues = [];
        foreach (ProjectLimits::KEYS as $key) {
            $limits[$key] = self::number($config[$key] ?? null);
            $ceilingValues[$key] = self::number($ceilings[$key] ?? null);
        }

        return [
            'usage' => $usage === null ? null : [
                'cpu_percent' => self::number($usage['cpu_percent'] ?? null),
                'memory_bytes' => Payload::int($usage['memory_bytes'] ?? null),
                'memory_limit_bytes' => Payload::int($usage['memory_limit_bytes'] ?? null),
                'sampled_at' => Payload::nullableString($usage['sampled_at'] ?? null),
            ],
            'disk' => $disk === null ? null : [
                'total_bytes' => Payload::int($disk['total_bytes'] ?? null),
                'limit_bytes' => Payload::int($disk['limit_bytes'] ?? null),
                'measured_at' => Payload::nullableString($disk['measured_at'] ?? null),
            ],
            'limits' => $limits,
            'ceilings' => $ceilingValues,
        ];
    }

    /**
     * A number from the Engine (int, float or numeric string), keeping whole
     * values as int; null for anything else.
     */
    private static function number(mixed $value): int|float|null
    {
        if (is_int($value) || is_float($value)) {
            return $value;
        }
        if (! is_string($value) || ! is_numeric($value)) {
            return null;
        }

        return str_contains($value, '.') || stripos($value, 'e') !== false ? (float) $value : (int) $value;
    }

    /**
     * What the project is: `wordpress` once F9 detects it, else `custom`.
     *
     * Two projects are WordPress before the detection says so (app-lite#1):
     * - one the panel installs WordPress on, whatever the install came to. A
     *   project created for WordPress is stored `custom` until the install
     *   succeeds, so a failed one showed the container "Deploy failed" card
     *   and its redeploy instead of "Install failed" and the install retry
     *   (CA: components/instances/InstanceItem.vue:466-468);
     * - one not checked yet whose Engine deploy is WordPress (Engine:
     *   core/app/Lib/Project/ProjectOverview.php:68-80, `app.type`).
     * The privileges keep following the detected type
     * (Privileges::forProject()).
     *
     * @param  array<string, mixed>  $payload
     */
    private function appType(Application $app, array $payload): string
    {
        $type = $app->type;
        if ($type !== null && $type !== '' && $type !== Application::TYPE_CUSTOM) {
            return $type;
        }
        if ($app->wordpressInstall !== null) {
            return Application::TYPE_WORDPRESS;
        }
        if (($type === null || $type === '')
            && (Payload::object($payload['app'] ?? null)['type'] ?? null) === Application::TYPE_WORDPRESS) {
            return Application::TYPE_WORDPRESS;
        }

        return Application::TYPE_CUSTOM;
    }

    /**
     * A staging instance carries its parent (with the parent's other stagings),
     * recursion-guarded by depth.
     *
     * @return array<string, mixed>|null
     */
    private function parentApp(Application $app, Authenticatable $user, int $depth): ?array
    {
        if (! $app->isStaging() || $depth > 0) {
            return null;
        }

        $parent = $app->stagingOf;
        if (! $parent instanceof Application) {
            return null;
        }

        // Hand the parent down to its stagings so the push mapping does not
        // query it per staging (V5d), and load what the presenter reads from
        // each of them in one query (V8d).
        $stagings = $parent->stagings;
        $stagings->each->setRelation('stagingOf', $parent);
        $stagings->loadMissing(['applicationLabels', 'wordpressAsyncStatuses', 'wordpressInstall', 'wordpressImport']);

        return $this->present($parent, $user, $stagings, 1);
    }

    /**
     * @param  array<string, mixed>  $details
     * @return array<string, mixed>|null
     */
    private function source(Application $app, array $details): ?array
    {
        // Source card is a custom (deploy) project concept; WordPress projects
        // do not show it, nor does a classic site with no git source (old
        // `InstanceSourceResource`: only a `git` or `files` install has one).
        if ($app->type === Application::TYPE_WORDPRESS) {
            return null;
        }
        $sourceType = StackDetector::context($app)['source_type'];
        if ($sourceType === null) {
            return null;
        }

        $gitRepo = $app->gitRepositoryUrl();

        return [
            'type' => $sourceType,
            'repo_url' => is_string($gitRepo) && $gitRepo !== '' ? $gitRepo : null,
            'repo_name' => is_string($gitRepo) && $gitRepo !== '' ? basename(self::repoPath($gitRepo)) : null,
            'branch' => Payload::nullableString($details['git_branch'] ?? null),
            'last_deploy' => null,
            'database' => ['present' => false, 'label' => null],
        ];
    }

    /**
     * The CA switches on these keys; map the Engine's `details.async_status`
     * (staging/push) and the panel-owned core update the Engine does not track
     * (`wordpress_async_status` type `core`).
     *
     * @param  array<string, mixed>  $details
     * @param  Collection<int, Application>  $stagings  the app's stagings (V5d)
     * @return array<string, mixed>
     */
    private function asyncStatus(Application $app, array $details, Collection $stagings): array
    {
        $engine = Payload::object($details['async_status'] ?? null);
        $map = static function (?string $value): ?string {
            return match ($value) {
                'completed', 'success' => 'finished',
                'in_progress', 'running' => 'in_progress',
                'failed', 'error' => 'failed',
                'pending', 'queued' => 'pending',
                default => null,
            };
        };
        $ownPush = $map(Payload::nullableString($engine['push'] ?? null));

        // The Engine keeps one `push` status, on the **target**. Each side maps
        // the target's status, so a reload during a push keeps the source's
        // buttons disabled: a staging source reads its live parent, a live
        // source its newest staging, and the live target its own status
        // (Instances.js:249-260).
        $parentPush = null;
        if ($app->isStaging()) {
            $parent = $app->stagingOf;
            $parentPush = $parent instanceof Application ? $map($this->pushOf($parent)) : null;
        }

        $stagingPush = null;
        if (! $app->isStaging()) {
            $newestStaging = $stagings->sortByDesc('id')->first();
            $stagingPush = $newestStaging instanceof Application ? $map($this->pushOf($newestStaging)) : null;
        }

        // The Engine has **no** `async_status.installation` (Models/User.php::
        // mergeAsyncStatus only writes staging/push/source): a live project's
        // installation is its deploys' outcome (`DeployState`). A
        // staging keeps the Engine's staging-creation status.
        $installation = $app->isStaging() ? null : $this->deploys->installation($app);

        if ($app->isStaging() && $app->staging_create_failed_at !== null) {
            // The Engine dropped the failed destination; the panel-owned marker
            // keeps the retry/delete menu.
            $installation = 'failed';
        } elseif ($app->isStaging()) {
            // A staging shows the Engine's staging-creation status. Until
            // the Engine has one, a copy the panel still watches is running:
            // without it the new staging read as ready at once and its end
            // changed nothing on screen (app-lite#1).
            $installation = $map(Payload::nullableString($engine['staging'] ?? null))
                ?? ($app->isStagingCreating() ? 'in_progress' : null);
        }

        // A core update is panel-owned (the Engine's async_status has no
        // `update` key): pending/finished/failed are already
        // CA values.
        $update = $this->panelAsyncStatus($app, WordPressAsyncStatus::CORE);

        return [
            'installation' => $installation,
            'update' => $update,
            'push_to_live' => $app->isStaging() ? $parentPush : null,
            'pull_from_staging' => $app->isStaging() ? null : $ownPush,
            'push_to_staging' => $app->isStaging() ? null : $stagingPush,
        ];
    }

    /**
     * The Engine `push` status of a mirrored project, raw.
     */
    private function pushOf(Application $application): ?string
    {
        $payload = $application->engine_payload ?? [];
        $details = Payload::object($payload['details'] ?? null);
        $async = Payload::object($details['async_status'] ?? null);

        return Payload::nullableString($async['push'] ?? null);
    }

    /**
     * The panel-owned status of one async row, from the eager-loaded relation
     * when a list loaded it (no N+1) or one query on a detail page.
     */
    private function panelAsyncStatus(Application $app, string $type): ?string
    {
        if ($app->relationLoaded('wordpressAsyncStatuses')) {
            $row = $app->wordpressAsyncStatuses->firstWhere('type', $type);

            return $row?->status;
        }

        return Payload::nullableString(
            WordPressAsyncStatus::query()
                ->where('application_id', $app->id)
                ->where('type', $type)
                ->value('status')
        );
    }

    /**
     * @param  array<string, mixed>  $details
     * @return array<string, mixed>
     */
    private function gitRepository(Application $app, array $details): array
    {
        // CA: src/components/cards/GitSourceInfoCard.vue:160-161 shows Redeploy only
        // for `connected === true`. An SSH-connected project has no `details.git_repo`
        // (the URL lives in the panel's `git_source`), so use the shared fallback.
        $repoUrl = $app->gitRepositoryUrl();
        $connected = $repoUrl !== null;

        return [
            'connected' => $connected,
            'id' => null,
            'repo_url' => $repoUrl,
            'branch' => $connected && is_string($details['git_branch'] ?? null) ? $details['git_branch'] : null,
            'commits_behind' => null,
            // Panel-owned (the Engine keeps no deploy history on the
            // project).
            'last_deployed_commit_hash' => $app->gitLastCommitHash(),
        ];
    }

    /**
     * homedir, mysql_db_prefix, ip_address, mysql_php_my_admin_sso_host (shared
     * with the service payload) plus the Engine username, for
     * `server_account_details`.
     *
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $rawDetails
     * @param  list<string>  $ipv4
     * @return array<string, string>
     */
    private function accountDerived(Application $app, array $config, array $rawDetails, array $ipv4): array
    {
        $username = (string) $app->engine_username;

        return ServerAccountDetails::derive($config, $rawDetails, $ipv4, $username, $app->presentedDomain()) + ['username' => $username];
    }

    /**
     * @param  array<string, mixed>  $config
     * @return list<string>
     */
    private function ipv4(array $config): array
    {
        $addresses = Payload::object($config['ip_addresses'] ?? null);

        // Only IPv4 literals count (no CIDR range), as in `ServicePresenter`.
        $own = is_array($addresses['ipv4'] ?? null)
            ? array_values(array_filter(
                Payload::strings($addresses['ipv4']),
                static fn (string $ip): bool => filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false,
            ))
            : [];

        // No usable address of its own: the server's (Community only, see the host binding).
        return $own !== [] ? $own : $this->serverIps->addresses();
    }

}
