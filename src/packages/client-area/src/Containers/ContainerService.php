<?php

namespace PanelAlpha\ClientArea\Containers;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Client\Response;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\Api\ContainersApi;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Container operations across the virtual service's accounts.
 * In single-server the service's accounts are the user's projects; every
 * Engine call goes through ContainersApi here, so the controller only
 * orchestrates.
 */
final class ContainerService
{
    public function __construct(
        private readonly ApplicationRepository $applications,
        private readonly EngineHealth $health,
    ) {}

    /**
     * One group per container (DinD) project, each with its containers. A
     * project the Engine refuses is reported and skipped, never failing the
     * list. An Engine that does not answer is asked
     * once; with no group left the list answers the Engine-down 503.
     *
     * @return list<array{application: Application, containers: list<array<string, mixed>>}>
     *
     * @throws EngineUnavailableException
     */
    public function groupsFor(Authenticatable $user): array
    {
        $groups = [];
        /** @var array<int, true> $unavailable */
        $unavailable = [];
        $timeout = null;

        // Polled every 15 s: read the mirror, never sync.
        foreach ($this->applications->forUser($user, refresh: false) as $application) {
            if (! $application->isContainer()) {
                continue;
            }

            $engineId = $application->engine_id;
            $containers = [];

            if (! isset($unavailable[$engineId])) {
                if ($this->health->isDown($engineId)) {
                    $unavailable[$engineId] = true;
                } else {
                    try {
                        $containers = (new ContainersApi($application->engine()))->list($application->engineProject());
                    } catch (EngineUnavailableException $e) {
                        $unavailable[$engineId] = true;
                        $timeout ??= $e;
                    } catch (EngineException $e) {
                        report($e);
                    }
                }
            }

            $groups[] = ['application' => $application, 'containers' => $containers];
        }

        if ($groups !== [] && $this->everyGroupUnavailable($groups, $unavailable)) {
            throw $timeout ?? new EngineUnavailableException('The Engine did not answer; no containers call was made.', transport: true);
        }

        if ($timeout !== null) {
            report($timeout);
        }

        return $groups;
    }

    /**
     * @param  list<array{application: Application, containers: list<array<string, mixed>>}>  $groups
     * @param  array<int, true>  $unavailable
     */
    private function everyGroupUnavailable(array $groups, array $unavailable): bool
    {
        foreach ($groups as $group) {
            if (! isset($unavailable[$group['application']->engine_id])) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function projectAction(Application $application, array $params): Response
    {
        return (new ContainersApi($application->engine()))->projectAction($application->engineProject(), $params);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function serviceAction(Application $application, string $container, array $params): Response
    {
        return (new ContainersApi($application->engine()))->serviceAction($application->engineProject(), $container, $params);
    }

    public function logs(Application $application, string $container, int $lines): string
    {
        return (new ContainersApi($application->engine()))->logs($application->engineProject(), $container, $lines);
    }
}
