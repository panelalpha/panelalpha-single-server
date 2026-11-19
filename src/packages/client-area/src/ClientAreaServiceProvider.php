<?php

namespace PanelAlpha\ClientArea;

use PanelAlpha\ClientArea\Contracts\SetupState;
use PanelAlpha\ClientArea\Access\NoSetupRequired;
use PanelAlpha\ClientArea\Access\NoCommunityPanel;
use PanelAlpha\ClientArea\Contracts\CommunityPanel;
use PanelAlpha\ClientArea\Contracts\HubLogin;
use PanelAlpha\ClientArea\Contracts\HubPairingStatus;
use PanelAlpha\ClientArea\Access\NoHubLogin;
use PanelAlpha\ClientArea\Access\NoHubPairingStatus;
use PanelAlpha\ClientArea\Contracts\WordPressSsoRestriction;
use PanelAlpha\ClientArea\Access\UnrestrictedWordPressSso;
use PanelAlpha\ClientArea\Contracts\ProjectSharing;
use PanelAlpha\ClientArea\Contracts\OnboardingSharing;
use PanelAlpha\ClientArea\Access\CommunityPlanFeatures;
use PanelAlpha\ClientArea\Access\NoOnboardingSharing;
use PanelAlpha\ClientArea\Contracts\ProjectFeaturedItems;
use PanelAlpha\ClientArea\Contracts\ProjectLimits;
use PanelAlpha\ClientArea\Limits\EngineProjectLimits;
use PanelAlpha\ClientArea\Support\NoProjectFeaturedItems;
use PanelAlpha\ClientArea\Access\SingleUserProjectSharing;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Foundation\Exceptions\Handler;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use PanelAlpha\ClientArea\Access\SingleOwnerApplicationRepository;
use PanelAlpha\ClientArea\Access\SingleServiceDirectory;
use PanelAlpha\ClientArea\Access\SingleUserAccessResolver;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Console\McpAdoptTokenCommand;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\ActingAdmin;
use PanelAlpha\ClientArea\Contracts\LoginPasswordSetup;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Contracts\AtarimSettings;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\ClientArea\Contracts\HomeAdminBlock;
use PanelAlpha\ClientArea\Contracts\HomeBillingFlags;
use PanelAlpha\ClientArea\Contracts\HomeResellerBranding;
use PanelAlpha\ClientArea\Contracts\LicenceProjectLimit;
use PanelAlpha\ClientArea\Contracts\PlanFeatures;
use PanelAlpha\ClientArea\Contracts\MirrorDeletionScope;
use PanelAlpha\ClientArea\Contracts\ServerIpv4Addresses;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Contracts\ServiceDnsEmail;
use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Contracts\NotificationTemplates;
use PanelAlpha\ClientArea\Contracts\DefaultBackupSchedule;
use PanelAlpha\ClientArea\Contracts\DiagnosticMode;
use PanelAlpha\ClientArea\Contracts\SocialLoginCredentials;
use PanelAlpha\ClientArea\Contracts\BackupDestination;
use PanelAlpha\ClientArea\Contracts\PrimaryDomainSwitcher;
use PanelAlpha\ClientArea\Contracts\StagingRetrier;
use PanelAlpha\ClientArea\Contracts\UncompletedImports;
use PanelAlpha\EngineClient\SingleEngineResolver;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\EngineProjectsSynced;
use PanelAlpha\ClientArea\Events\ProjectDomainChanged;
use PanelAlpha\ClientArea\Events\ProjectMirrored;
use PanelAlpha\ClientArea\Events\ProjectsUnmirrored;
use PanelAlpha\ClientArea\Hosting\DnsHostGuard;
use PanelAlpha\ClientArea\Hosting\DomainProbe;
use PanelAlpha\ClientArea\Hosting\DnsHostResolver;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Hosting\HostResolver;
use PanelAlpha\ClientArea\Hosting\PinnedProbe;
use PanelAlpha\ClientArea\Hosting\SslProbe;
use PanelAlpha\ClientArea\Hosting\FirstEngineBackupContainer;
use PanelAlpha\ClientArea\Hosting\ComposedPrimaryDomainSwitch;
use PanelAlpha\ClientArea\Http\ClientAreaRoutes;
use PanelAlpha\ClientArea\Http\Middleware\EnsureApplicationPrivilege;
use PanelAlpha\ClientArea\Http\Middleware\EnsureUserPrivilege;
use PanelAlpha\ClientArea\Http\Middleware\LogActivity;
use PanelAlpha\ClientArea\Http\Middleware\LogSecretReveal;
use PanelAlpha\ClientArea\Listeners\QueueMissingWordPressDetails;
use PanelAlpha\ClientArea\Listeners\QueueProjectScreenshot;
use PanelAlpha\ClientArea\Listeners\SearchReplaceOnDomainChange;
use PanelAlpha\ClientArea\Listeners\SendApplicationNotification;
use PanelAlpha\ClientArea\Listeners\SyncMcpScopes;
use PanelAlpha\ClientArea\Mcp\McpGate;
use PanelAlpha\ClientArea\Jobs\Git\FollowGitHookDeploysJob;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Models\GitOperation;
use PanelAlpha\ClientArea\Onboarding\WordPressOrg;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Notifications\ApplicationNotifier;
use PanelAlpha\ClientArea\Projects\ClassicOnboardingGitAttacher;
use PanelAlpha\ClientArea\Projects\GitAutoDeployHooks;
use PanelAlpha\ClientArea\Projects\GitAutoDeployService;
use PanelAlpha\ClientArea\Projects\GitOperationRecorder;
use PanelAlpha\ClientArea\Projects\GitSourceAttacher;
use PanelAlpha\ClientArea\Projects\DeleteAndRecreateStagingRetrier;
use PanelAlpha\ClientArea\Projects\GitOperationLog;
use PanelAlpha\ClientArea\Provisioning\SingleEngineProvisioner;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\NoActingAdmin;
use PanelAlpha\ClientArea\Support\NoLoginPasswordSetup;
use PanelAlpha\ClientArea\Support\NoHomeAdminBlock;
use PanelAlpha\ClientArea\Support\NoHomeBillingFlags;
use PanelAlpha\ClientArea\Support\NoHomeResellerBranding;
use PanelAlpha\ClientArea\Support\NoServerIpv4Addresses;
use PanelAlpha\ClientArea\Support\NoServiceDnsEmail;
use PanelAlpha\ClientArea\Support\SimpleServiceOnboarding;
use PanelAlpha\ClientArea\Support\NoLicenceProjectLimit;
use PanelAlpha\ClientArea\Support\NoNotificationTemplates;
use PanelAlpha\ClientArea\Support\NoDefaultBackupSchedule;
use PanelAlpha\ClientArea\Support\NoDiagnosticMode;
use PanelAlpha\ClientArea\Support\NoSocialLoginCredentials;
use PanelAlpha\ClientArea\Support\NoUncompletedImports;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\ClientArea\Sync\ReplacingMarkerDeletionScope;
use Symfony\Component\HttpFoundation\Response;

/**
 * Edition-agnostic wiring. The four contracts default to the Community answers –
 * one user, one Engine – bound with `bindIf()`, so an edition package (Pro,
 * Multi) that binds a contract with `singleton()` replaces the default
 * whatever the provider order. Replacing only some of the single-user answers
 * fails the boot ({@see SingleUserMode}).
 */
class ClientAreaServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // The controller's settings (`client-area`).
        $this->mergeConfigFrom(__DIR__.'/../config/client-area.php', 'client-area');

        // The four edition questions default to Community: one
        // Engine, one user who owns every project on it. `bindIf()` keeps an
        // edition's binding whichever provider registers first, and a later
        // `singleton()` replaces this one; `shared` keeps the singleton
        // lifetime the Community edition package bound them with.
        // `/home` asks every edition; only the Community package has a first-run wizard.
        $this->app->bindIf(SetupState::class, NoSetupRequired::class);
        $this->app->bindIf(CommunityPanel::class, NoCommunityPanel::class);
        $this->app->bindIf(HubLogin::class, NoHubLogin::class);
        $this->app->bindIf(HubPairingStatus::class, NoHubPairingStatus::class);
        $this->app->bindIf(WordPressSsoRestriction::class, UnrestrictedWordPressSso::class);
        // The project payload's owner and shares: nobody else's
        // in Community; edition-pro binds its `application_access` answer.
        $this->app->bindIf(ProjectSharing::class, SingleUserProjectSharing::class);
        // The onboarding's `shared_access`: ignored in Community
        //Edition-pro binds its sharing service.
        $this->app->bindIf(OnboardingSharing::class, NoOnboardingSharing::class);
        $this->app->bindIf(EngineResolver::class, SingleEngineResolver::class, shared: true);
        $this->app->bindIf(ApplicationRepository::class, SingleOwnerApplicationRepository::class, shared: true);
        $this->app->bindIf(AccessResolver::class, SingleUserAccessResolver::class, shared: true);
        $this->app->bindIf(ApplicationProvisioner::class, SingleEngineProvisioner::class, shared: true);

        // The plan and its features: Community here; the paid edition binds the
        // licence's plan.
        $this->app->bindIf(PlanFeatures::class, CommunityPlanFeatures::class, shared: true);

        // The hosting services: Community's one
        // virtual service; a paid edition binds its `services` table.
        $this->app->bindIf(ServiceDirectory::class, SingleServiceDirectory::class, shared: true);

        // The server's IPv4 list for a project without its own (the host binds
        // its cached Engine system info).
        $this->app->bindIf(ServerIpv4Addresses::class, NoServerIpv4Addresses::class);

        // The `/home` admin block (none in Community; the paid Admin Area binds
        // its "login as user" session).
        $this->app->bindIf(HomeAdminBlock::class, NoHomeAdminBlock::class);

        // Who acts on a logged request (always the user in Community;
        // the paid Admin Area binds its "login as user" session mark).
        $this->app->bindIf(ActingAdmin::class, NoActingAdmin::class);

        // The login's set-password step (none in Community; the paid
        // Admin Area binds the sign-up's code flow).
        $this->app->bindIf(LoginPasswordSetup::class, NoLoginPasswordSetup::class);

        // The `/home` billing and sign-up flags (none in Community;
        // the paid Admin Area binds its background-billing settings).
        $this->app->bindIf(HomeBillingFlags::class, NoHomeBillingFlags::class);

        // A reseller's branding and `reseller_settings` in `/home` (none in
        // Community; the paid Admin Area binds the reseller area's).
        $this->app->bindIf(HomeResellerBranding::class, NoHomeResellerBranding::class);

        // A service's onboarding from its plan: the `/home` wizard keys, the
        // install's mode and the theme browser's blacklist (the
        // simple onboarding in Community; the paid Admin Area binds the plan's).
        $this->app->bindIf(ServiceOnboarding::class, SimpleServiceOnboarding::class);

        // A service's DNS and e-mail servers: the hosting pages' flags and the
        // service's privilege list (none in Community; the paid Admin
        // Area binds the service's servers and plan).
        $this->app->bindIf(ServiceDnsEmail::class, NoServiceDnsEmail::class);

        // A project's featured plugins and themes (none in Community;
        // the paid Admin Area binds its packages').
        $this->app->bindIf(ProjectFeaturedItems::class, NoProjectFeaturedItems::class);

        // The limits a client may set on a project and their ceilings (no
        // ceiling in Community; the paid edition binds the plan's values).
        $this->app->bindIf(ProjectLimits::class, EngineProjectLimits::class);

        // Whether the panel still has an uncompleted migration, for the Client
        // Area's `/home` badge (always none in Community; the paid Admin Area
        // binds its `imports` table).
        $this->app->bindIf(UncompletedImports::class, NoUncompletedImports::class);

        // The single-server licence's project limit: none in Community; the
        // paid Admin Area binds the injected licensing client's answer.
        $this->app->bindIf(LicenceProjectLimit::class, NoLicenceProjectLimit::class);

        // Whether a project in diagnostic mode refuses actions (never in Community;
        // the paid Admin Area binds its `diagnostic_statuses` rows).
        $this->app->bindIf(DiagnosticMode::class, NoDiagnosticMode::class);

        // Social-login credentials kept by the panel (none in Community: the host
        // reads config/services.php; the paid Admin Area binds its enabled
        // auth integrations).
        $this->app->bindIf(SocialLoginCredentials::class, NoSocialLoginCredentials::class);

        // Where a project's backups go (the first Engine container in Community;
        // the paid Admin Area binds its backup container rules).
        $this->app->bindIf(BackupDestination::class, FirstEngineBackupContainer::class);

        // The schedule a project without one starts from (none in the controller:
        // the Community edition binds the Settings defaults of its own projects).
        $this->app->bindIf(DefaultBackupSchedule::class, NoDefaultBackupSchedule::class);

        // Editable notification templates (none in Community: the notifications
        // keep their own texts; the paid Admin Area binds its template store).
        $this->app->bindIf(NotificationTemplates::class, NoNotificationTemplates::class);

        // The collaboration link's Atarim settings: the host binds
        // them from its settings table; without a host binding the integration
        // is off, so the route answers its "Integration is disabled" 422 instead
        // of failing to resolve.
        $this->app->bindIf(AtarimSettings::class, static fn (): AtarimSettings => new AtarimSettings(enabled: false, referralLink: ''));

        // The staging retry deletes and re-creates the failed staging.
        $this->app->bindIf(StagingRetrier::class, DeleteAndRecreateStagingRetrier::class);

        // The primary-domain switch is composed from Engine calls (the
        // Engine has no atomic switch).
        $this->app->bindIf(PrimaryDomainSwitcher::class, ComposedPrimaryDomainSwitch::class);

        // The sync resolves every scope tagged under MirrorDeletionScope. The
        // controller tags the `replacing_at` scope (moved from client-area-legacy,
        // which tagged it) with the same singleton lifetime.
        $this->app->singleton(ReplacingMarkerDeletionScope::class);
        $this->app->tag([ReplacingMarkerDeletionScope::class], MirrorDeletionScope::TAG);
        $this->app->when(ApplicationSynchronizer::class)
            ->needs('$deletionScopes')
            ->give(fn () => $this->app->tagged(MirrorDeletionScope::TAG));

        // The Client Area notification delivery: moved back from client-area-legacy with the same
        // singleton lifetime; the listener is registered in boot().
        $this->app->singleton(ApplicationNotifier::class);
        $this->app->singleton(SendApplicationNotification::class);

        // The WordPress URL rewrite after a domain rename:
        // moved from client-area-legacy with the same singleton lifetime; the
        // listener is registered in boot().
        $this->app->singleton(SearchReplaceOnDomainChange::class);

        // The onboarding form's wordpress.org catalog: moved from
        // client-area-legacy with the same singleton
        // lifetime; its routes are `routes/onboarding_catalog.php`.
        $this->app->singleton(WordPressOrg::class);

        // The panel-side domain reachability probe: moved
        // from client-area-legacy with the same singleton bindings; only the
        // probe routes (`routes/probes.php`) resolve them. Certificates are the
        // Engine's `ssl-check`.
        $this->app->singleton(DomainProbe::class);
        $this->app->singleton(PinnedProbe::class, SslProbe::class);

        // Outbound requests to user-controlled hosts are guarded/probed by
        // injected services so tests can fake them.
        $this->app->bind(HostResolver::class, DnsHostResolver::class);
        $this->app->bind(HostGuard::class, DnsHostGuard::class);

        // No `DeployTracker` seam: the
        // deploy history is the Engine's and the controller follows every
        // deploy it starts itself (`DeployState::follow()`).

        // The panel's `git_operations` log and the auto-deploy hooks with the
        // provider webhook are the defaults;
        // both moved back from client-area-legacy, and the pass-through and
        // disabled defaults were deleted.
        $this->app->bindIf(GitOperationRecorder::class, GitOperationLog::class);
        $this->app->bindIf(GitAutoDeployHooks::class, GitAutoDeployService::class);

        // The classic-onboarding attacher is the default (moved back from
        // client-area-legacy, which bound it); it delegates to the plain `POST source`
        // `EngineGitSourceAttacher`.
        $this->app->bindIf(GitSourceAttacher::class, ClassicOnboardingGitAttacher::class);
    }

    public function boot(Router $router): void
    {
        // Named limiter for every route that makes the Engine/panel fetch a
        // user-controlled host, its own bucket per user.
        RateLimiter::for('outbound', fn (Request $request) => Limit::perMinute(10)
            ->by($request->user()?->getAuthIdentifier() ?? $request->ip()));

        RateLimiter::for('ssl-check', fn (Request $request) => Limit::perMinute(120)
            ->by($request->user()?->getAuthIdentifier() ?? $request->ip()));

        // Reading a masked secret is a rare action; the bucket is per user, so
        // one account cannot lock another out. Laravel sorts the throttle ahead
        // of the route's `log-secret-reveal` and it throws before that
        // middleware sees an answer, so the refused request is recorded here
        // with the same answer the exception would have produced.
        RateLimiter::for('secrets-reveal', fn (Request $request) => Limit::perMinute(10)
            ->by($request->user()?->getAuthIdentifier() ?? $request->ip())
            ->response(static function (Request $request, array $headers): Response {
                app(LogSecretReveal::class)->refused($request, 429);

                throw new ThrottleRequestsException('Too Many Attempts.', null, $headers);
            }));

        $this->loadMigrationsFrom(__DIR__.'/../database/migrations');

        // The package translations (`general`, and the CA notification texts
        // `notifications`, back from client-area-legacy with the notifier).
        $this->loadTranslationsFrom(__DIR__.'/../lang', 'client-area');

        $this->publishes([
            __DIR__.'/../config/client-area.php' => config_path('client-area.php'),
        ], 'client-area-config');

        $router->aliasMiddleware('privilege', EnsureApplicationPrivilege::class);
        $router->aliasMiddleware('privilege-user', EnsureUserPrivilege::class);
        // The activity log is a Client Area feature: the alias
        // is the recording middleware itself.
        $router->aliasMiddleware('activity', LogActivity::class);
        // Every secret reveal is recorded, granted or refused; unlike `activity`
        // it also records the failed attempts the route's own guards answer.
        $router->aliasMiddleware('log-secret-reveal', LogSecretReveal::class);

        // Jobs and services request a notification through
        // `ClientAreaNotificationRequested`, and the controller delivers it.
        Event::listen(ClientAreaNotificationRequested::class, SendApplicationNotification::class);
        Event::listen(ClientAreaNotificationRequested::class, QueueProjectScreenshot::class);

        // Connect AI scopes follow the users' projects: a real sync,
        // a new mirror row and removed rows queue the scope sync of the token
        // owners. The listener only queues; the job calls the Engine.
        Event::listen([EngineProjectsSynced::class, ProjectMirrored::class, ProjectsUnmirrored::class], SyncMcpScopes::class);

        Event::listen(EngineProjectsSynced::class, QueueMissingWordPressDetails::class);

        // After a committed domain rename the controller runs the WordPress
        // search-replace. No tunnel cleanup is needed: the Engine's rename deletes the
        // old main domain row and its tunnels with it, and the panel keeps no
        // tunnel cache.
        Event::listen(ProjectDomainChanged::class, SearchReplaceOnDomainChange::class);

        // The Engine client's exceptions carry facts only; the Client Area's
        // answers to them (statuses, the old-style 422s, the redaction of
        // Engine internals) are registered here.
        $this->callAfterResolving(ExceptionHandler::class, static function (ExceptionHandler $handler): void {
            if ($handler instanceof Handler) {
                EngineErrors::register($handler);
            }
        });

        // {application} is always resolved for the current user, so a project
        // the user cannot see is a 404 on every route that uses it.
        Route::bind('application', function (string $value) {
            $user = request()->user();
            abort_if($user === null, 401);
            abort_unless(ctype_digit($value), 404);

            return $this->app->make(ApplicationRepository::class)->findForUser($user, (int) $value);
        });

        $this->registerRoutes();

        // The activity log's retention moved from
        // client-area-legacy's `prune-client-area-legacy-tables` entry; review
        // 56 L5 moved the git operation log's too, and that entry is gone (each
        // package prunes only its own models). Same frequency, no overlap
        // guard, as the combined entry had.
        $this->callAfterResolving(Schedule::class, static function (Schedule $schedule): void {
            $schedule->command('model:prune', ['--model' => [ActivityLog::class, GitOperation::class]])
                ->daily()
                ->name('prune-client-area-tables');

            // Follow the Engine's hook deploys of projects with
            // auto-deploy on (notifications, `webhook_pull`, last commit).
            // Moved from client-area-legacy's schedule with the
            // same name (the overlap mutex is derived from it), frequency and
            // `withoutOverlapping()`.
            $schedule->job(new FollowGitHookDeploysJob)->everyFiveMinutes()->name('follow-git-hook-deploys')->withoutOverlapping();
        });

        // Single-user mode is all or nothing: every provider has
        // registered by now, so an edition that replaced only some of the four
        // contracts fails the boot here and never serves.
        SingleUserMode::active($this->app);

        // The operator's adoption of Engine MCP tokens minted before the panel recorded their owner.
        if ($this->app->runningInConsole()) {
            $this->commands([McpAdoptTokenCommand::class]);
        }

        // Connect AI is registered in every edition:
        // each token is minted per user, scoped to that user's projects, and
        // `/mcp` forwards only tokens the panel minted.
        $this->registerMcp();
    }

    /**
     * The Client Area's `/api` routes.
     */
    private function registerRoutes(): void
    {
        // Every Client Area route file is mounted through the same helper, so
        // the prefix and middleware stack are the same for each.
        ClientAreaRoutes::group(function (): void {
            require __DIR__.'/../routes/api.php';
            require __DIR__.'/../routes/hosting.php';
            require __DIR__.'/../routes/git.php';
            require __DIR__.'/../routes/logs.php';
            require __DIR__.'/../routes/reporting.php';
            require __DIR__.'/../routes/app_users.php';
            require __DIR__.'/../routes/domain_change.php';
            require __DIR__.'/../routes/wordpress.php';
            // The per-project labels, back from client-area-legacy
            // with the same stack (`activity`, `privilege:`).
            require __DIR__.'/../routes/labels.php';
            // The activity history, back from client-area-legacy
            // with the same stack (`privilege:general.view_logs`).
            require __DIR__.'/../routes/activity.php';
            // The preview tunnels, back from client-area-legacy
            // with the same stack (`privilege:hosting.phpmyadmin_sso`).
            require __DIR__.'/../routes/preview.php';
            // The deploy history, back from client-area-legacy
            // with the same stack (`privilege:general.view_logs`), read from
            // the Engine.
            require __DIR__.'/../routes/deploy_history.php';
            // The onboarding catalog, back from
            // client-area-legacy with the same stack (no privilege, no throttle).
            require __DIR__.'/../routes/onboarding_catalog.php';
            // The probe and certificate routes, back from
            // client-area-legacy with the same stack (`throttle:outbound`).
            require __DIR__.'/../routes/probes.php';
            // The git operation log, back from
            // client-area-legacy with the same stack (no privilege).
            require __DIR__.'/../routes/git_history.php';
            // The auto-deploy toggle, back from
            // client-area-legacy with the same stack
            // (`privilege:general.manage_git`).
            require __DIR__.'/../routes/git_auto_deploy.php';
        });

        // The user's labels (`/labels`), back from
        // client-area-legacy. The host mounted them under `/api` with `api` +
        // `auth` and without the Client Area's `activity` middleware, so they
        // are mounted the same way instead of through
        // `ClientAreaRoutes::group()`: method, URI and middleware stay identical.
        Route::prefix('api')->middleware(['api', 'auth'])->group(function (): void {
            require __DIR__.'/../routes/user_labels.php';
        });

        // The Atarim collaboration link, back from
        // client-area-legacy. The host mounted it under `/api` with `api` +
        // `auth` and without the Client Area's `activity` middleware, so it
        // is mounted the same way: method, URI and middleware
        // (`privilege:general.collaboration`) stay identical. It reads the
        // `AtarimSettings` the host binds from its `settings` table.
        Route::prefix('api')->middleware(['api', 'auth'])->group(function (): void {
            require __DIR__.'/../routes/collaboration.php';
        });
    }

    /**
     * The Connect AI MCP surface: the token routes, the
     * activity log and the `/mcp` gatekeeper, with the `mcp` limiter.
     */
    private function registerMcp(): void
    {
        // The old /mcp route's `throttle:mcp` (60/min), applied to the token
        // **and** the real client IP: rotating a bearer must not reset the
        // bucket. The token bucket keys on the Sanctum
        // token id and a digest of the bearer, never the raw bearer
        // (`McpGate::limiterKey()`). `$request->ip()` is the real client because
        // the container nginx is a trusted proxy (bootstrap/app.php).
        RateLimiter::for('mcp', function (Request $request): array {
            $limits = [Limit::perMinute(60)->by('mcp-ip:'.($request->ip() ?? 'unknown'))];

            $token = McpGate::limiterKey($request->bearerToken());
            if ($token !== null) {
                $limits[] = Limit::perMinute(60)->by($token);
            }

            return $limits;
        });

        $this->loadRoutesFrom(__DIR__.'/../routes/mcp.php');
    }
}
