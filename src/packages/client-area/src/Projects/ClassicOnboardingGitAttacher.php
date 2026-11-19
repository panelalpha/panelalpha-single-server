<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Jobs\Application\AttachGitSourceJob;
use PanelAlpha\ClientArea\Jobs\Application\ReplaceClassicOnboardingProjectJob;

/**
 * The classic-onboarding implementation of the `GitSourceAttacher` seam: the
 * CA's plain domain step creates a classic project, which the Engine cannot take
 * a git source for. The panel replaces it in the background
 * ({@see ReplaceClassicOnboardingProjectJob}) so the CA reads the accepted
 * answer and never the Engine's "Create the project with `template: dind`".
 *
 * An eligible project is delegated to the plain `POST source` attacher
 * ({@see EngineGitSourceAttacher}); when the Engine answers that one's attach
 * with a busy 409 (the domain-step project still preparing), the attach is
 * deferred to {@see AttachGitSourceJob} so the CA never reads the busy 409
 * Both deferrals moved here from the controller.
 *
 * Permanent panel code: the Engine attaches a source to a
 * container project only, and the classic replacement
 * the CA's domain step needs with several services is panel code (re-check
 * 2026-10-15), so this moved from client-area-legacy into
 * the controller and is the `GitSourceAttacher` default.
 */
final class ClassicOnboardingGitAttacher implements GitSourceAttacher
{
    public function __construct(private readonly EngineGitSourceAttacher $default) {}

    public function attach(Application $application, array $source, string $finishedType, string $failedType): GitSourceAttachResult
    {
        // A replacement is already swapping this project: the CA follows that
        // install, so a repeated deploy answers the same accepted state
        // (a pending install row did this before the panel stopped keeping deploy rows).
        if (ClassicOnboardingState::isReplacing($application)) {
            return GitSourceAttachResult::handled();
        }

        if (! ClassicOnboardingState::isUntouchedOnboardingProject($application)) {
            try {
                return $this->default->attach($application, $source, $finishedType, $failedType);
            } catch (EngineRequestException $e) {
                if (! EngineGitSourceAttacher::isBusy($e)) {
                    throw $e;
                }

                // The domain-step project is still preparing; wait in the
                // background so the CA never reads the Engine's busy 409.
                AttachGitSourceJob::dispatch($application->id, $source, $finishedType, $failedType);

                return GitSourceAttachResult::handled();
            }
        }

        // Mark the swap before the job runs, so a repeated deploy in between
        // answers the accepted state above instead of a second replacement
        // (the job sets the marker again when it starts).
        $application->forceFill(['replacing_at' => now()])->save();
        ReplaceClassicOnboardingProjectJob::dispatch($application->id, $source, $finishedType, $failedType);

        return GitSourceAttachResult::handled();
    }

    /**
     * The plain domain step (no git/files `source_type`) creates a classic
     * project. Mark it so a later git deploy can tell
     * it from a live project and replace it; the
     * files/git domain step keeps its own markers. Moved from
     * `ServiceDomainController::store` with the column.
     */
    public function domainStepCreated(Application $application, ?string $sourceType): void
    {
        if (in_array($sourceType, ['git', 'files'], true)) {
            return;
        }

        $application->forceFill(['onboarding_at' => now()])->save();
    }
}
