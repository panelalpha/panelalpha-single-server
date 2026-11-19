<?php

namespace PanelAlpha\ClientArea\Listeners;

use PanelAlpha\EngineClient\Api\WordPressApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Events\ProjectDomainChanged;
use PanelAlpha\ClientArea\Models\Application;

/**
 * After a committed main-domain rename of a
 * WordPress project, rewrite the site's URLs the way the old panel did.
 * The Engine's rename does not do it, so the panel runs the explicit
 * `wp/search-replace` itself. Moved out of `DomainChangeService` with the
 * listener, ported from the old panel's
 * `ChangeDomainController`.
 *
 * Permanent panel code: the Engine does not need to do it, so the listener
 * moved from client-area-legacy into the controller, which registers it for
 * `ProjectDomainChanged` itself.
 */
final class SearchReplaceOnDomainChange
{
    public function handle(ProjectDomainChanged $event): void
    {
        $application = $event->application;
        if ($application->type === Application::TYPE_WORDPRESS && $event->oldDomain !== null && $event->oldDomain !== '') {
            $this->searchReplace($application, $event->oldDomain, $event->newDomain);
        }
    }

    /**
     * The old `ChangeDomainController::wordpressDatabaseSearchReplace`
     * (`:425-448`): search the old domain, retry with `--precise`, and on that
     * second failure run a `--dry-run` for the log. The old panel swallowed the
     * final failure (its outer `HealthCheck::fromController` catch), so v1 does
     * too – the domain rename already happened.
     */
    public function searchReplace(Application $application, string $oldDomain, string $newDomain): void
    {
        $api = new WordPressApi($application->engine(), $application->wordpressInstallPath());

        try {
            $api->searchReplace($application->engineProject(), $oldDomain, $newDomain);

            return;
        } catch (EngineException|EngineValidationException $e) {
            report($e);
        }

        try {
            $api->searchReplace($application->engineProject(), $oldDomain, $newDomain, ['--precise']);

            return;
        } catch (EngineException|EngineValidationException $e) {
            $precise = $e;
        }

        try {
            $api->searchReplace($application->engineProject(), $oldDomain, $newDomain, ['--dry-run']);
        } catch (EngineException|EngineValidationException $e) {
            report($e);
        }

        report($precise);
    }
}
