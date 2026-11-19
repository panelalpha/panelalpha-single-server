<?php

namespace PanelAlpha\ClientArea\Git\Providers;

/**
 * A git host's webhook API, as far as auto-deploy needs it.
 * Ported from the old `GitProviderInterface` (registration, rotation and
 * deletion); the incoming hook itself is verified by the Engine, not here.
 *
 * Permanent panel code: the panel registers the provider webhook itself, as
 * the old panel did, so this moved from client-area-legacy into the controller. Ported
 * from the old panel's
 * `app/Lib/Interfaces/Integrations/GitProvider/GitProviderInterface.php`.
 */
interface GitProvider
{
    /**
     * Register a push webhook and return the provider's id for it.
     *
     * @param  bool  $insecureSsl  the Engine hook reports a self-signed
     *                             certificate, so the git host must not verify
     *                             it (never when the certificate is valid)
     */
    public function registerWebhook(string $callbackUrl, #[\SensitiveParameter] string $secret, ?string $branch, bool $insecureSsl): string;

    public function deleteWebhook(string $externalId): void;

    /**
     * Read the repository at the provider's API with the token: git sends none to a public repository.
     *
     * @throws TokenRefusedException the provider answered 401
     */
    public function checkToken(): void;
}
