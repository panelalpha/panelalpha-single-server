<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Support\Carbon;

/**
 * One deploy of the history in the Client Area's vocabulary: an
 * Engine deploy (`id` is its deploy id) or a stored task tail (`task-<id>`).
 * Built by {@see DeployHistoryService}, shaped by `DeployHistoryPresenter`.
 */
final class DeployEntry
{
    public function __construct(
        public readonly string $id,
        public readonly ?string $engineDeployId,
        public readonly string $status,
        public readonly string $sourceType,
        public readonly ?string $error,
        public readonly ?string $warning,
        public readonly ?Carbon $startedAt,
        public readonly ?Carbon $finishedAt,
        /**
         * The Engine's create deploy, `running` until the project's files
         * arrive (`DeployLogger::WAITING_FOR_FILES`, {@see DeployState::waitsForFiles()}):
         * not a deploy anything is working on.
         */
        public readonly bool $waitingForFiles = false,
    ) {}
}
