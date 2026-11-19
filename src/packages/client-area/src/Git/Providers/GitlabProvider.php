<?php

namespace PanelAlpha\ClientArea\Git\Providers;

use PanelAlpha\ClientArea\Support\Payload;

/**
 * GitLab repository webhooks, self-hosted instances included (old
 * `App\Lib\Apis\Gitlab`).
 *
 * Permanent panel code: the panel registers the provider webhook itself, as
 * the old panel did, so this moved from client-area-legacy into the controller. Ported
 * from the old panel's `app/Lib/Apis/Gitlab.php`.
 */
final class GitlabProvider extends AbstractProvider
{
    public function registerWebhook(string $callbackUrl, #[\SensitiveParameter] string $secret, ?string $branch, bool $insecureSsl): string
    {
        // GitLab sends the secret verbatim in the `X-Gitlab-Token` header, so the
        // Engine verifies the hook's `token` field - not a `signing_token` HMAC
        // (Engine core/app/Lib/DeployHook/GitlabProvider.php:15-47).
        // The secret is the Engine's 48-hex-char hook secret
        // (core/app/Models/DeployHook.php:50-53); there is no `whsec_` prefix.
        $payload = [
            'url' => $callbackUrl,
            'push_events' => true,
            'token' => $secret,
            // Only a self-signed Engine certificate justifies switching the
            // host's verification off.
            'enable_ssl_verification' => ! $insecureSsl,
        ];

        if ($branch !== null && $branch !== '') {
            $payload['branch_filter_strategy'] = 'wildcard';
            $payload['push_events_branch_filter'] = $branch;
        }

        return Payload::string($this->client()->post($this->hookPath(), $payload)->throw()->json('id'));
    }

    public function deleteWebhook(string $externalId): void
    {
        $this->client()->delete($this->hookPath($externalId))->throw();
    }

    public function checkToken(): void
    {
        $this->assertTokenAccepted($this->client(), '/projects/'.rawurlencode($this->target->projectPath));
    }

    private function hookPath(string $externalId = ''): string
    {
        $path = '/projects/'.rawurlencode($this->target->projectPath).'/hooks';

        return $externalId === '' ? $path : $path.'/'.$externalId;
    }
}
