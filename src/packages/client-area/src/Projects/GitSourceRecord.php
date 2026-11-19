<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\ClientArea\Git\RepositoryUrl;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Keeps the panel's own record of a git source the onboarding sent to the
 * Engine, the same columns the Git card writes on connect ({@see GitService}):
 * `git_source`, `git_provider` and the provider token (encrypted by the model
 * cast, never returned). Without it the card shows "No token saved" and
 * auto-deploy refuses with missing credentials after a wizard deploy.
 */
final class GitSourceRecord
{
    public static function store(Application $application, string $repo, ?string $token): void
    {
        $attributes = [
            'git_source' => $repo,
            'git_provider' => RepositoryUrl::provider($repo),
        ];

        // A public repository has no token to keep; a token already saved is
        // not wiped by an attach that sent none.
        if ($token !== null && $token !== '') {
            $attributes['git_token'] = $token;
        }

        $application->forceFill($attributes)->save();
    }
}
