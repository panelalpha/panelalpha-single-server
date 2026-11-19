<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * Social-login credentials kept by the panel instead of the environment: a
 * DB-backed credential source the host prefers over env. The old panel read them from its `integrations` table;
 * the paid Admin Area binds its own, so a provider enabled there is offered
 * by the Client Area's login. Community has no such source: the controller's
 * default answers null and the host reads `config/services.php`.
 */
interface SocialLoginCredentials
{
    /**
     * The OAuth client of an enabled provider (the CA's slug: `google`,
     * `facebook`, `github`, `linkedin`), or null when this source has none.
     *
     * @return array{client_id: string, client_secret: string}|null
     */
    public function for(string $provider): ?array;
}
