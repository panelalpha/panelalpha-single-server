<?php

namespace PanelAlpha\ClientArea\Provisioning;

use PanelAlpha\ClientArea\Models\Application;

/**
 * Outcome of ApplicationProvisioner::provision(): the local row (status
 * 'pending' until the Engine task finishes) and the Engine task to follow with
 * GET /tasks/{taskId}.
 */
final readonly class ProvisionResult
{
    public function __construct(
        public Application $application,
        public ?int $taskId,
    ) {}
}
