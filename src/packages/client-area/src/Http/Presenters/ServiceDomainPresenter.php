<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use PanelAlpha\ClientArea\Models\Application;

/**
 * The onboarding domain step's answer: the old
 * `DomainResource` shape `{id, domain}`, never the raw Application model
 * (engine_project_id / engine_payload secrets).
 */
final class ServiceDomainPresenter
{
    /**
     * @return array{id: int, domain: string|null}
     */
    public function present(Application $application): array
    {
        return [
            'id' => $application->id,
            // The old `www.`-less domain.
            'domain' => $application->presentedDomain(),
        ];
    }
}
