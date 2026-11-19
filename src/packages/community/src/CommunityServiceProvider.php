<?php

namespace PanelAlpha\Community;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Http\Request;
use Illuminate\Mail\MailManager;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use PanelAlpha\ClientArea\Contracts\BackupDestination;
use PanelAlpha\ClientArea\Contracts\DefaultBackupSchedule;
use PanelAlpha\ClientArea\Contracts\CommunityPanel;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Events\EngineProjectsSynced;
use PanelAlpha\Community\Console\HubClaimInstallCodeCommand;
use PanelAlpha\Community\Jobs\ApplyNewProjectBackupSchedules;
use PanelAlpha\Community\Mail\EngineMailRelay;
use PanelAlpha\Community\Backups\SettingsBackupDestination;
use PanelAlpha\Community\Backups\SettingsDefaultBackupSchedule;
use PanelAlpha\ClientArea\Contracts\HubLogin;
use PanelAlpha\ClientArea\Contracts\HubPairingStatus;
use PanelAlpha\Community\Hub\CommunityHubPanel;
use PanelAlpha\Community\Hub\PairedHubLogin;
use PanelAlpha\Community\Hub\PanelSettingsHubStore;
use PanelAlpha\Community\Hub\RecordHubAppChanges;
use PanelAlpha\Community\Hub\RecordHubAppNotifications;
use PanelAlpha\Community\Hub\SingleUserHubPairingStatus;
use PanelAlpha\Hub\Contracts\HubPanel;
use PanelAlpha\Hub\Contracts\HubSettings;
use PanelAlpha\Community\Http\Middleware\AuthenticatedOrSetupRequired;
use PanelAlpha\ClientArea\Contracts\SetupState;
use PanelAlpha\Community\Setup\SingleUserCommunityPanel;
use PanelAlpha\Community\Setup\UsersTableSetupState;

class CommunityServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/community.php', 'community');

        // `bind`, not `singleton`: the answer changes once the first user exists.
        // `bind`, not `bindIf`: it replaces the controller's NoSetupRequired
        // default (only the Community deployment installs this package).
        $this->app->bind(SetupState::class, UsersTableSetupState::class);
        // The Client Area shows the Community pages and no Admin Area link (`app.community_panel`).
        $this->app->bind(CommunityPanel::class, SingleUserCommunityPanel::class);
        // "Sign in with PanelAlpha" on the Client Area login page (`app.hub_login`).
        $this->app->bind(HubLogin::class, PairedHubLogin::class);
        // The Community menu reminder to pair with PanelAlpha Hub (`app.hub_paired`).
        $this->app->bind(HubPairingStatus::class, SingleUserHubPairingStatus::class);
        // PanelAlpha Hub (panelalpha/hub): the pairing lives in the `settings`
        // table, and the panel reports itself as `single-server-community`.
        $this->app->bind(HubSettings::class, PanelSettingsHubStore::class);
        $this->app->bind(HubPanel::class, CommunityHubPanel::class);
        // The store and retention come from Settings; `bind` replaces the controller's `bindIf` default.
        $this->app->bind(BackupDestination::class, SettingsBackupDestination::class);
        // A project without a schedule starts from the Settings hour and its own minute.
        $this->app->bind(DefaultBackupSchedule::class, SettingsDefaultBackupSchedule::class);
    }

    public function boot(): void
    {
        RateLimiter::for('community.setup', fn (Request $request) => Limit::perMinute(5)->by((string) $request->ip()));
        RateLimiter::for('community.hub', function (Request $request): Limit {
            /** @var int|string|null $id */
            $id = $request->user()?->getAuthIdentifier();

            return Limit::perMinute(30)->by($id !== null ? (string) $id : (string) $request->ip());
        });

        // Each start is an outbound Hub call; a guest (the setup wizard) gets the setup form's limit.
        RateLimiter::for('community.hub-start', fn (Request $request): Limit => $request->user() === null
            ? Limit::perMinute(5)->by((string) $request->ip())
            : Limit::none());

        RateLimiter::for('community.settings', function (Request $request): Limit {
            /** @var int|string|null $id */
            $id = $request->user()?->getAuthIdentifier();

            return Limit::perMinute(30)->by($id !== null ? (string) $id : (string) $request->ip());
        });

        // The Go catalog's search box asks as the user types (debounced); Go allows 240 a minute per account.
        RateLimiter::for('community.go', function (Request $request): Limit {
            /** @var int|string|null $id */
            $id = $request->user()?->getAuthIdentifier();

            return Limit::perMinute(120)->by($id !== null ? (string) $id : (string) $request->ip());
        });

        RateLimiter::for('community.tasks', function (Request $request): Limit {
            /** @var int|string|null $id */
            $id = $request->user()?->getAuthIdentifier();

            return Limit::perMinute(120)->by($id !== null ? (string) $id : (string) $request->ip());
        });

        // Old `hub-login` limiter: 30 a minute per route and IP (RouteServiceProvider.php:85-86).
        RateLimiter::for('community.hub-login', function (Request $request): Limit {
            $route = $request->route();

            return Limit::perMinute(30)->by(($route instanceof \Illuminate\Routing\Route ? (string) $route->getName() : '').'|'.(string) $request->ip());
        });

        $this->registerRoutes();

        // PanelAlpha Hub monitoring events: app down/up and removal after each
        // sync, install and backup outcomes from the Client Area's notifications.
        Event::listen(EngineProjectsSynced::class, RecordHubAppChanges::class);
        Event::listen(ClientAreaNotificationRequested::class, RecordHubAppNotifications::class);

        // The installer's Hub code, claimed once by the entrypoint at the first boot.
        $this->commands([HubClaimInstallCodeCommand::class]);

        // Like the legacy schedule: a name (the overlap mutex is derived from it) and `withoutOverlapping()`.
        $this->callAfterResolving(Schedule::class, function (Schedule $schedule): void {
            $schedule->job(new ApplyNewProjectBackupSchedules)->everyMinute()->name('community:new-project-backups')->withoutOverlapping();
        });

        // The Engine hands the relay's address; without it the host's `log` mailer stays.
        $this->callAfterResolving(MailManager::class, function (MailManager $manager): void {
            EngineMailRelay::register($manager);
            EngineMailRelay::apply($this->app);
        });
    }

    /**
     * The Community panel's `/api` routes: Hub login, the first-run setup, the Hub
     * pairing, settings, backups, the Go catalog and tasks.
     */
    private function registerRoutes(): void
    {
        // Guest "Sign in with PanelAlpha" (contract 2.1-2.3).
        Route::prefix('api')->middleware(['api', 'throttle:community.hub-login'])->group(function (): void {
            require __DIR__.'/../routes/hub-login.php';
        });

        // `api` gives the endpoint a session and CSRF; no `auth`, the caller is a guest.
        Route::prefix('api')->middleware(['api', 'throttle:community.setup'])->group(function (): void {
            require __DIR__.'/../routes/setup.php';
        });

        // Signed in, or a guest while the first-run setup is required (Connect setup); `disconnect` keeps `auth`.
        Route::aliasMiddleware('community.hub-access', AuthenticatedOrSetupRequired::class);

        Route::prefix('api/community/hub')->middleware(['api', 'throttle:community.hub'])->group(function (): void {
            require __DIR__.'/../routes/hub.php';
        });

        Route::prefix('api/community/settings')->middleware(['api', 'auth', 'throttle:community.settings'])->group(function (): void {
            require __DIR__.'/../routes/settings.php';
        });

        Route::prefix('api/community/backups')->middleware(['api', 'auth', 'throttle:community.settings'])->group(function (): void {
            require __DIR__.'/../routes/backups.php';
        });

        // PanelAlpha Go's catalog for the onboarding's PanelAlpha Go source.
        Route::prefix('api/community/go')->middleware(['api', 'auth', 'throttle:community.go'])->group(function (): void {
            require __DIR__.'/../routes/go.php';
        });

        Route::prefix('api/community/tasks')->middleware(['api', 'auth', 'throttle:community.tasks'])->group(function (): void {
            require __DIR__.'/../routes/tasks.php';
        });
    }
}
