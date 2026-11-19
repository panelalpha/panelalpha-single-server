<?php

namespace PanelAlpha\ClientArea\Projects;

use PanelAlpha\ClientArea\Models\Application;

/**
 * A seam: the auto-deploy Engine hook and the git provider
 * webhook (the Engine has no provider webhook, so the panel registers it, as
 * the old panel did; not needed from the Engine).
 *
 * The controller default is {@see GitAutoDeployService} (`bindIf`, so an
 * edition may still replace it).
 */
interface GitAutoDeployHooks
{
    /**
     * Enable auto-deploy: create the Engine deploy hook and register the push
     * webhook at the provider.
     */
    public function enable(Application $application): void;

    /**
     * Disable auto-deploy: delete the Engine hook first, then the provider
     * webhook, then clear the stored marker.
     */
    public function disable(Application $application): void;

    /**
     * Rotate the Engine hook's URL/secret and re-register the provider webhook.
     */
    public function rotate(Application $application): void;

    /**
     * Delete only the provider webhook (the Engine hook was removed by the
     * Engine disconnect, or is being replaced).
     */
    public function deleteProviderWebhook(Application $application): void;
}
