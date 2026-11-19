<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use App\Models\Notification;
use PanelAlpha\ClientArea\Jobs\Sync\SyncEnginesJob;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Keep the local mirror of every Engine reasonably fresh even
// when nobody is looking at the panel. The job itself honours the sync TTL.
Schedule::job(new SyncEnginesJob)->everyMinute()->name('sync-engines')->withoutOverlapping();

// The hook-deploy follower and the retention of the activity and git operation
// logs are scheduled by panelalpha/client-area's provider.

// Refresh the cached Engine system info so `/home` never calls the Engine.
Schedule::call(fn () => app(\App\Support\EngineSystemInfo::class)->refresh())
    ->everyMinute()
    ->name('refresh-engine-system-info')
    ->withoutOverlapping();

// Refresh the cached "is an Engine task running" flag the /home badge reads.
Schedule::call(fn () => app(\App\Support\EngineRunningTasks::class)->refresh())
    ->everyMinute()
    ->name('refresh-engine-running-tasks')
    ->withoutOverlapping();

// Retention: prune the notification bell past its TTL.
Schedule::command('model:prune', ['--model' => [Notification::class]])
    ->daily()
    ->name('prune-panel-tables');

// A per-id job that ends its retry window while the Engine is still down must
// never stay in failed_jobs; prune whatever else lands there.
Schedule::command('queue:prune-failed')->daily()->name('prune-failed-jobs');
