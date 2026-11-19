<?php

namespace PanelAlpha\ClientArea\Limits;

use Illuminate\Contracts\Container\Container;
use PanelAlpha\ClientArea\Contracts\ProjectLimits;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\Api\ProjectsApi;

/**
 * Community's answer: no plan, so no project limit has a ceiling, and a save is a
 * plain Engine update.
 */
final class EngineProjectLimits implements ProjectLimits
{
    public function __construct(
        private readonly ApplicationSynchronizer $synchronizer,
        private readonly Container $container,
    ) {}

    public function ceilings(Application $application): array
    {
        return array_fill_keys(self::KEYS, null);
    }

    /**
     * Engine: core/app/Http/Controllers/UserController.php (update) -> the project resource.
     *
     * The answer is mirrored into `engine_payload` before the `resources` block is
     * built, so a read inside the sync TTL does not show the old limits.
     */
    public function update(Application $application, array $values): array
    {
        $project = (new ProjectsApi($application->engine()))->update($application->engineProject(), $values);

        $mirrored = $this->synchronizer->mirror($application->engine_id, $project) ?? $application->refresh();

        // The presenter needs this contract for the ceilings, so it is resolved
        // here and not injected (a constructor cycle).
        return $this->container->make(ProjectPresenter::class)->resources($mirrored) ?? [];
    }
}
