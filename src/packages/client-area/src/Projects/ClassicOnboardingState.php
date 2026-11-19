<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Jobs\Application\ReplaceClassicOnboardingProjectJob;

/**
 * The classic-onboarding state of a mirror row, read from the
 * `onboarding_at` / `replacing_at` columns (the Engine cannot
 * attach a git source to the classic project the CA's plain domain step
 * creates, so the panel replaces it). Moved from `Application::isReplacing()`
 * and `Application::isUntouchedOnboardingProject()`.
 *
 * Permanent panel code: the Engine attaches a source to a
 * container project only, and the classic replacement
 * the CA's domain step needs with several services is panel code (re-check
 * 2026-10-15), so this moved from client-area-legacy into
 * the controller.
 */
final class ClassicOnboardingState
{
    /**
     * Whether the classic-onboarding git replacement is still swapping this
     * row's Engine project. A marker older than the
     * job's wall-clock cap plus its maximum backoff is stale (the job was lost),
     * so the row is reconciled like any other. Mirrors
     * {@see \PanelAlpha\ClientArea\Sync\ReplacingMarkerDeletionScope}'s keep
     * condition.
     */
    public static function isReplacing(Application $application): bool
    {
        return $application->replacing_at !== null
            && $application->replacing_at->gt(now()->subSeconds(ReplaceClassicOnboardingProjectJob::STALE_AFTER_SECONDS));
    }

    /**
     * Whether this is still the **untouched** project the plain domain step
     * created: the classic `onboarding_at` marker is
     * set and the files marker was never set. Only such a project may be
     * replaced by the git-onboarding job; the replacement clears
     * `onboarding_at` when its create lands, and a replacement in progress is
     * {@see self::isReplacing()} (the accepted install row decided both before
     * the panel stopped keeping deploy rows).
     */
    public static function isUntouchedOnboardingProject(Application $application): bool
    {
        return $application->onboarding_at !== null
            && $application->onboarding_files_at === null;
    }
}
