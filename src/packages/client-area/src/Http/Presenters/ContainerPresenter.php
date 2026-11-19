<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use PanelAlpha\ClientArea\Models\Application;

/**
 * Shapes the container list the Client Area reads: one
 * group per account with the project id/username/domain and its containers.
 */
final class ContainerPresenter
{
    /**
     * @param  list<array<string, mixed>>  $containers
     * @return array<string, mixed>
     */
    public function group(Application $application, array $containers): array
    {
        return [
            'account' => [
                'id' => $application->id,
                'username' => $application->engine_username,
                'domain' => $application->domain,
            ],
            'containers' => $containers,
        ];
    }

    /**
     * @param  list<array{application: Application, containers: list<array<string, mixed>>}>  $groups
     * @return list<array<string, mixed>>
     */
    public function groups(array $groups): array
    {
        return array_map(
            fn (array $group): array => $this->group($group['application'], $group['containers']),
            $groups,
        );
    }
}
