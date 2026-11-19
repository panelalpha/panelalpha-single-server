<?php

namespace PanelAlpha\ClientArea\Services;

/**
 * A hosting service as the Client Area shows it (old `User\ServiceResource`):
 * the subscription a user's projects belong to. Community has exactly one, the
 * virtual service ({@see \PanelAlpha\ClientArea\Support\VirtualService});
 * a paid edition has one per user and plan.
 */
final readonly class HostingService
{
    /**
     * @param  int|null  $projectLimit  null = unlimited
     */
    public function __construct(
        public int $id,
        public string $planName,
        public string $status = 'active',
        public ?int $projectLimit = null,
        public bool $isTrial = false,
        public ?string $trialExpiresAt = null,
        public bool $owned = true,
        // Whether the project's user may change its automatic backups; a plan
        // that sets them for its projects says no (Pro `BackupSchedules`).
        public bool $automaticBackupsEditable = true,
        // The plan's upgrade link (old `Service::getUpgradeUrl()`): `""` without one; null in Community, which has no plans.
        public ?string $upgradeLink = null,
    ) {}
}
