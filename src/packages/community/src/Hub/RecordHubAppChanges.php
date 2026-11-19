<?php

namespace PanelAlpha\Community\Hub;

use Illuminate\Contracts\Cache\Repository as Cache;
use PanelAlpha\ClientArea\Events\EngineProjectsSynced;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\Support\Payload;
use PanelAlpha\Hub\HubEvents;
use PanelAlpha\Hub\HubPairing;

/**
 * After every sync of the panel's Engine (each minute) the apps are compared
 * with the previous sync, and what changed becomes a Hub monitoring event
 * (contract §6a): `app_down` / `app_up` when an app goes down or comes back
 * (`HubAppFacts::isUp`), `app_removed` when it left the panel, deleted here
 * or on the Engine. The first sync after pairing only sets the baseline; a
 * project still being created is not an app yet.
 */
final class RecordHubAppChanges
{
    /** id => {name, up}: what the previous sync saw. */
    public const string KEY = 'community:hub-app-states';

    public function __construct(
        private readonly HubPairing $pairing,
        private readonly HubEvents $events,
        private readonly CommunityHubPanel $panel,
        private readonly Cache $cache,
    ) {}

    public function handle(EngineProjectsSynced $event): void
    {
        if ($event->engineId !== EngineConnection::DEFAULT_ID) {
            return;
        }
        if (! $this->pairing->isPaired()) {
            $this->cache->forget(self::KEY);

            return;
        }

        $before = self::states($this->cache->get(self::KEY));

        $now = [];
        foreach ($this->panel->mirrored() as $app) {
            if ($app->status === 'pending') {
                continue;
            }
            $id = (string) $app->id;
            $name = CommunityHubPanel::appName($app);
            $project = is_array($app->engine_payload) ? $app->engine_payload : [];
            $was = $before[$id]['up'] ?? null;
            $up = HubAppFacts::isUp($project);

            if ($up === null) {
                // Building, never deployed or suspended: the last known state stays.
                $up = $was;
            } elseif ($was !== null && $was !== $up) {
                $up
                    ? $this->events->record(HubEvents::APP_UP, $id, $name)
                    : $this->events->record(HubEvents::APP_DOWN, $id, $name, HubAppFacts::downReason($project));
            }
            $now[$id] = ['name' => $name, 'up' => $up];
        }

        foreach (array_diff_key($before ?? [], $now) as $id => $gone) {
            $this->events->record(HubEvents::APP_REMOVED, (string) $id, $gone['name']);
        }

        $this->cache->forever(self::KEY, $now);
    }

    /**
     * What the previous sync saw, null before the first one (or when the
     * stored value is not what this class wrote).
     *
     * @return array<string, array{name: string|null, up: bool|null}>|null
     */
    private static function states(mixed $stored): ?array
    {
        if (! is_array($stored)) {
            return null;
        }

        $states = [];
        foreach (array_keys($stored) as $id) {
            $state = Payload::object($stored[$id]);
            $states[(string) $id] = [
                'name' => Payload::nullableString($state['name'] ?? null),
                'up' => Payload::bool($state['up'] ?? null),
            ];
        }

        return $states;
    }
}
