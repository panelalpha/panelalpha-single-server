<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Make an addon domain the project's primary domain. The Engine has no atomic
 * endpoint and will not get one, so the
 * controller's default {@see \PanelAlpha\ClientArea\Hosting\ComposedPrimaryDomainSwitch}
 * composes the old panel's flow. Before, client-area-legacy bound
 * the composition and the controller refused with `REFUSAL`.
 */
interface PrimaryDomainSwitcher
{
    /**
     * @throws ValidationException
     */
    public function switch(Application $application, string $domain): void;
}
