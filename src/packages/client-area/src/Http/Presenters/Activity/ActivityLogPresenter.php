<?php

namespace PanelAlpha\ClientArea\Http\Presenters\Activity;

use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Models\ActivityLog;

/**
 * Shapes one activity-log row the way the Client Area reads it (migration
 * section C, old ActivityLogResource).
 */
final class ActivityLogPresenter
{
    /**
     * Actions the CA renders from two `App\Models\Application` entries, where
     * the **second** one is the staging (`LogItem.vue:99-101`).
     */
    private const STAGING_ACTIONS = [
        'user.instance.staging.create',
        'user.instance.staging.retry_install',
    ];

    /**
     * @return array<string, mixed>
     */
    public function present(ActivityLog $log): array
    {
        // The actor is the user the row recorded, never the viewer.
        // A deleted user leaves the fields null.
        $actor = $log->user;

        return [
            'user' => [
                'first_name' => $actor?->getAttribute('first_name'),
                'last_name' => $actor?->getAttribute('last_name'),
                'email' => $actor?->getAttribute('email'),
                'role' => null,
            ],
            'action' => $log->action,
            'payload' => $this->payload($log),
            'ip_address' => $log->ip_address,
            'date' => $log->created_at->toJSON(),
            'request_method' => $log->request_method,
        ];
    }

    /**
     * MySQL stores JSON objects with re-sorted keys, so the insertion order of
     * the two Application snapshots is not reliable after a round trip. The CA
     * reads `instances[1]` as the staging (`InstanceLogMixin.js:56-58`), and a
     * staging row is always created after its parent, so present the snapshots
     * ordered by id - parent first.
     *
     * @return array<string, mixed>
     */
    private function payload(ActivityLog $log): array
    {
        $payload = $log->payload ?? [];

        if (! in_array($log->action, self::STAGING_ACTIONS, true)) {
            return $payload;
        }

        $ids = [];
        foreach (array_keys($payload) as $key) {
            if (is_array($payload[$key]) && isset($payload[$key]['id'])) {
                $ids[$key] = Payload::int($payload[$key]['id']) ?? 0;
            }
        }

        if (count($ids) < 2) {
            return $payload;
        }

        asort($ids);

        return array_replace(array_fill_keys(array_keys($ids), null), $payload);
    }
}
