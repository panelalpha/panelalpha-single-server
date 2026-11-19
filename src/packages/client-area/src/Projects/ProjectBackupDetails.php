<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Support\Facades\Cache;
use PanelAlpha\ClientArea\Jobs\Application\RefreshProjectBackupsJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

final class ProjectBackupDetails
{
    public const FRESH_SECONDS = 300;

    public const KEEP_SECONDS = 86400;

    public const GRACE_HOURS = 24;

    public const RECENT_HOURS = 24;

    /**
     * @param  array<string, mixed>  $project
     * @return array<string, mixed>
     */
    public function apply(Application $application, array $project): array
    {
        $cached = $this->cached($application);
        $backupsAt = Payload::int($cached['backups_at'] ?? null);
        $scheduleAt = Payload::int($cached['schedule_at'] ?? null);
        $staleBefore = now()->getTimestamp() - self::FRESH_SECONDS;
        if ($backupsAt === null || $scheduleAt === null || min($backupsAt, $scheduleAt) < $staleBefore) {
            RefreshProjectBackupsJob::dispatch($application->id)->onConnection('database');
        }

        if ($backupsAt === null || $scheduleAt === null) {
            return $project;
        }

        $scheduled = (bool) ($cached['scheduled'] ?? false);
        $covered = $scheduled || (bool) ($cached['has_automatic'] ?? false);
        $project['has_automatic_backup'] = $covered;
        $project['needs_recent_backup_warning'] = $this->needsWarning(
            $application,
            $covered,
            Payload::int($cached['latest_finished'] ?? null),
        );

        return $project;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    public function rememberBackups(Application $application, array $rows): void
    {
        $latest = null;
        $hasAutomatic = false;
        foreach ($rows as $row) {
            if (($row['type'] ?? null) === 'automatic') {
                $hasAutomatic = true;
            }
            $create = Payload::nullableString(Payload::object($row['async_status'] ?? null)['create'] ?? null);
            if ($create !== null && $create !== 'finished') {
                continue;
            }
            $date = Payload::int($row['date'] ?? null);
            if ($date !== null && ($latest === null || $date > $latest)) {
                $latest = $date;
            }
        }

        $this->store($application, [
            'latest_finished' => $latest,
            'has_automatic' => $hasAutomatic,
            'backups_at' => now()->getTimestamp(),
        ]);
    }

    public function rememberSchedule(Application $application, bool $scheduled): void
    {
        $this->store($application, [
            'scheduled' => $scheduled,
            'schedule_at' => now()->getTimestamp(),
        ]);
    }

    public static function cacheKey(Application $application): string
    {
        return 'client-area:project-backups:'.$application->id;
    }

    private function needsWarning(Application $application, bool $covered, ?int $latestFinished): bool
    {
        $createdAt = $application->engine_created_at;
        if ($createdAt !== null && $createdAt->greaterThan(now()->subHours(self::GRACE_HOURS))) {
            return false;
        }

        if ($covered) {
            return false;
        }

        return $latestFinished === null
            || $latestFinished < now()->subHours(self::RECENT_HOURS)->getTimestamp();
    }

    /**
     * @param  array<string, mixed>  $part
     */
    private function store(Application $application, array $part): void
    {
        Cache::put(self::cacheKey($application), array_merge($this->cached($application), $part), self::KEEP_SECONDS);
    }

    /**
     * @return array<string, mixed>
     */
    private function cached(Application $application): array
    {
        /** @var mixed $cached */
        $cached = Cache::get(self::cacheKey($application));
        if (! is_array($cached)) {
            return [];
        }

        /** @var array<string, mixed> $cached */
        return $cached;
    }
}
