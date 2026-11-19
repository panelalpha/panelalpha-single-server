<?php

namespace PanelAlpha\Hub;

use DateTimeInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * The monitoring events the panel owes PanelAlpha Hub (contract §6a): kept in
 * `hub_events` until `hub:events` delivers them, so an event raised while the
 * Hub cannot be reached keeps its own time. Recorded only while the panel is
 * paired, and sent only to the pairing it was recorded for. Recording never
 * throws: an install or a backup must not fail because of the Hub.
 */
final class HubEvents
{
    public const string APP_DOWN = 'app_down';

    public const string APP_UP = 'app_up';

    public const string APP_INSTALL_STARTED = 'app_install_started';

    public const string APP_INSTALL_SUCCEEDED = 'app_install_succeeded';

    public const string APP_INSTALL_FAILED = 'app_install_failed';

    public const string APP_REMOVED = 'app_removed';

    public const string BACKUP_SUCCEEDED = 'backup_succeeded';

    public const string BACKUP_FAILED = 'backup_failed';

    /** What a panel may send: the Hub refuses the whole batch (422) for any other type. */
    public const array TYPES = [
        self::APP_DOWN, self::APP_UP,
        self::APP_INSTALL_STARTED, self::APP_INSTALL_SUCCEEDED, self::APP_INSTALL_FAILED,
        self::APP_REMOVED, self::BACKUP_SUCCEEDED, self::BACKUP_FAILED,
    ];

    /** The Hub's batch cap. */
    public const int BATCH = 200;

    /** How many wait while the Hub cannot be reached; beyond it the oldest go. */
    public const int KEEP = 1000;

    private const string TABLE = 'hub_events';

    public function __construct(private readonly HubPairing $pairing) {}

    /**
     * @param  string|null  $reason  shown to the customer: one plain sentence, no stack trace, no secret
     */
    public function record(string $type, ?string $appId = null, ?string $appName = null, ?string $reason = null, ?DateTimeInterface $at = null): void
    {
        if (! in_array($type, self::TYPES, true)) {
            return;
        }

        try {
            $serverId = $this->pairing->serverId();
            if ($serverId === null) {
                return;
            }

            DB::table(self::TABLE)->insert([
                'server_id' => $serverId,
                'event_type' => $type,
                'app_id' => self::text($appId, 64),
                'app_name' => self::text($appName, 255),
                'reason' => self::text($reason !== null ? Str::squish($reason) : null, 1024),
                'occurred_at' => Carbon::instance($at ?? now())->utc()->format('Y-m-d H:i:s'),
            ]);
            $this->prune($serverId);
        } catch (Throwable $e) {
            Log::warning('PanelAlpha Hub event not recorded', ['event_type' => $type, 'exception' => $e::class]);
        }
    }

    /**
     * The oldest events of the current pairing, as the Hub takes them. Events
     * of an earlier pairing are dropped here.
     *
     * @return array<int, array{event_type: string, app_id: string|null, app_name: string|null, reason: string|null, occurred_at: string}> by row id
     */
    public function pending(int $limit = self::BATCH): array
    {
        $serverId = $this->pairing->serverId();
        DB::table(self::TABLE)->where('server_id', '!=', (string) $serverId)->delete();
        if ($serverId === null) {
            return [];
        }

        $events = [];
        foreach (DB::table(self::TABLE)->where('server_id', $serverId)->orderBy('id')->limit($limit)->get() as $row) {
            $events[(int) $row->id] = [
                'event_type' => (string) $row->event_type,
                'app_id' => $row->app_id !== null ? (string) $row->app_id : null,
                'app_name' => $row->app_name !== null ? (string) $row->app_name : null,
                'reason' => $row->reason !== null ? (string) $row->reason : null,
                'occurred_at' => Carbon::parse((string) $row->occurred_at, 'UTC')->format('Y-m-d\TH:i:s\Z'),
            ];
        }

        return $events;
    }

    /**
     * @param  list<int>  $ids
     */
    public function forget(array $ids): void
    {
        if ($ids !== []) {
            DB::table(self::TABLE)->whereIn('id', $ids)->delete();
        }
    }

    private function prune(string $serverId): void
    {
        /** @var int|string|null $keepFrom */
        $keepFrom = DB::table(self::TABLE)->where('server_id', $serverId)
            ->orderByDesc('id')->skip(self::KEEP)->value('id');
        if ($keepFrom !== null) {
            DB::table(self::TABLE)->where('server_id', $serverId)->where('id', '<=', $keepFrom)->delete();
        }
    }

    private static function text(?string $value, int $max): ?string
    {
        $value = $value !== null ? trim($value) : '';

        return $value === '' ? null : mb_substr($value, 0, $max);
    }
}
