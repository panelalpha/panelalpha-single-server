<?php

namespace PanelAlpha\Hub;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\ServiceProvider;
use PanelAlpha\Hub\Console\HubDisconnectCommand;
use PanelAlpha\Hub\Console\HubEventsCommand;
use PanelAlpha\Hub\Console\HubReportCommand;

/**
 * PanelAlpha Hub: the config (`hub.url`), the `hub_events` outbox, the
 * `hub:report`, `hub:events` and `hub:disconnect` commands, the report's
 * five-minute and the events' one-minute schedule. The
 * product that installs the package binds `Contracts\HubSettings` (where the
 * pairing lives) and `Contracts\HubPanel` (what the panel tells the Hub);
 * sign-in and the HTTP routes are the product's own.
 */
final class HubServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/hub.php', 'hub');
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/../database/migrations');
        $this->commands([HubReportCommand::class, HubEventsCommand::class, HubDisconnectCommand::class]);

        $this->callAfterResolving(Schedule::class, static function (Schedule $schedule): void {
            $schedule->command(HubReportCommand::class)
                ->everyFiveMinutes()
                ->onOneServer()
                ->withoutOverlapping()
                ->name('hub-report');
            $schedule->command(HubEventsCommand::class)
                ->everyMinute()
                ->onOneServer()
                ->withoutOverlapping()
                ->name('hub-events');
        });
    }
}
