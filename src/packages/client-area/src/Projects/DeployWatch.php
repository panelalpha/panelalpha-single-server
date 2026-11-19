<?php

namespace PanelAlpha\ClientArea\Projects;

/**
 * How an accepted deploy is followed: the CA notification types
 * its watcher sends when the deploy ends, and the staged archive the watcher
 * deletes afterwards (null for git deploys). The controller hands it to
 * {@see DeployState::follow()} (the `DeployTracker` seam's `accepted()` before
 * the panel stopped keeping deploy rows).
 */
final class DeployWatch
{
    public function __construct(
        public readonly string $finishedType,
        public readonly string $failedType,
        public readonly ?string $archivePath = null,
    ) {}
}
