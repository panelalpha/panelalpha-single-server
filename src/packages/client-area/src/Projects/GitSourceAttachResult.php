<?php

namespace PanelAlpha\ClientArea\Projects;

/**
 * What the {@see GitSourceAttacher} did, so the caller knows whether it must
 * follow an accepted install deploy (the seam never starts the watcher itself).
 */
final class GitSourceAttachResult
{
    private function __construct(
        /** Whether the Engine accepted the attach synchronously. */
        public readonly bool $accepted,
        /** The Engine task id of the accepted attach, when it returned one. */
        public readonly ?int $taskId,
    ) {}

    /**
     * The Engine accepted the source; the caller follows the install with the
     * deploy watcher.
     */
    public static function accepted(?int $taskId): self
    {
        return new self(true, $taskId);
    }

    /**
     * Nothing to record here: the source was already attached, or a job
     * (`AttachGitSourceJob` /
     * `ReplaceClassicOnboardingProjectJob`) now owns the attach.
     */
    public static function handled(): self
    {
        return new self(false, null);
    }
}
