<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\ClientArea\Models\Application;

/**
 * A seam: attach a git source to an existing project
 * during onboarding.
 *
 * The controller default is {@see ClassicOnboardingGitAttacher} (`bindIf`, so
 * an edition may still replace it): the classic-onboarding replacement (the
 * Engine cannot attach a source to the untouched classic project the
 * domain step created) around the plain `POST /projects/{u}/source` of
 * {@see EngineGitSourceAttacher}.
 *
 * The caller holds the per-application deploy lock around {@see self::attach()}
 * and records the accepted install row from the returned result, so the seam
 * owns only the Engine attach and the deferred (job) paths.
 */
interface GitSourceAttacher
{
    /**
     * Attach the repository. Returns `accepted` with the Engine task id when
     * the Engine accepted synchronously (the caller records and follows the
     * install), or `handled` when a job now owns the attach (classic
     * replacement or a busy project) or the source is already attached.
     *
     * @param  array{git_repo: string, git_branch: string|null, git_token: string|null, env_vars: array<string, string|null>}  $source
     */
    public function attach(Application $application, array $source, string $finishedType, string $failedType): GitSourceAttachResult;

    /**
     * The domain step created this project. `$sourceType` is the
     * CA's `source_type` (null for the plain WordPress `createDomain`, which
     * creates a classic project). The classic-onboarding implementation marks a classic
     * project as the untouched onboarding project a later git deploy replaces
     * (the `onboarding_at` column); the plain attacher keeps nothing.
     */
    public function domainStepCreated(Application $application, ?string $sourceType): void;
}
