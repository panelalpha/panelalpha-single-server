<?php

namespace PanelAlpha\Community\Hub;

use Illuminate\Contracts\Cache\Repository as Cache;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\Hub\HubEvents;

/**
 * The Client Area's install and backup outcomes as Hub monitoring events
 * (contract §6a). An install (a deploy, a WordPress install or import, a
 * copy) ends with `installation_finished` / `installation_failed`; its
 * `app_install_started` goes with the outcome, timed when the panel created
 * the project, once per app and only for a project created in the last day.
 * A manual backup ends with `backup.create_finished` / `_failed`; the
 * Engine's scheduled backups are not followed by the panel. The reasons are
 * fixed sentences: the notification's own message may carry Engine output.
 */
final class RecordHubAppNotifications
{
    public const array TYPES = [
        'user.instance.installation_finished' => HubEvents::APP_INSTALL_SUCCEEDED,
        'user.instance.installation_failed' => HubEvents::APP_INSTALL_FAILED,
        'user.instance.backup.create_finished' => HubEvents::BACKUP_SUCCEEDED,
        'user.instance.backup.create_failed' => HubEvents::BACKUP_FAILED,
    ];

    private const array REASONS = [
        HubEvents::APP_INSTALL_FAILED => 'The installation did not finish.',
        HubEvents::BACKUP_FAILED => 'The backup did not finish.',
    ];

    /** How recent a project's creation must be to be the start of the install that ended. */
    private const int STARTED_WITHIN_SECONDS = 86400;

    public function __construct(
        private readonly HubEvents $events,
        private readonly Cache $cache,
    ) {}

    public function handle(ClientAreaNotificationRequested $event): void
    {
        $type = self::TYPES[$event->type] ?? null;
        if ($type === null) {
            return;
        }

        $app = $event->application;
        $id = (string) $app->id;
        $name = CommunityHubPanel::appName($app);
        $created = $app->panel_created_at;
        if (in_array($type, [HubEvents::APP_INSTALL_SUCCEEDED, HubEvents::APP_INSTALL_FAILED], true)
            && $created !== null && $created->gte(now()->subSeconds(self::STARTED_WITHIN_SECONDS))
            && $this->cache->add('community:hub-install-started:'.$id, true, self::STARTED_WITHIN_SECONDS)) {
            $this->events->record(HubEvents::APP_INSTALL_STARTED, $id, $name, null, $created);
        }

        $this->events->record($type, $id, $name, self::REASONS[$type] ?? null);
    }
}
