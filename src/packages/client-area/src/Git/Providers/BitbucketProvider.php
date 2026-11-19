<?php

namespace PanelAlpha\ClientArea\Git\Providers;

use PanelAlpha\ClientArea\Support\Payload;

/**
 * Bitbucket repository webhooks (old `App\Lib\Apis\Bitbucket`).
 * Bitbucket has no switch for the host's certificate verification.
 *
 * Permanent panel code: the panel registers the provider webhook itself, as
 * the old panel did, so this moved from client-area-legacy into the controller. Ported
 * from the old panel's `app/Lib/Apis/Bitbucket.php`.
 */
final class BitbucketProvider extends AbstractProvider
{
    public function registerWebhook(string $callbackUrl, #[\SensitiveParameter] string $secret, ?string $branch, bool $insecureSsl): string
    {
        return Payload::string($this->client()->post($this->hookPath(), [
            'description' => 'PanelAlpha auto-deploy',
            'url' => $callbackUrl,
            'active' => true,
            'events' => ['repo:push'],
            'secret' => $secret,
        ])->throw()->json('uuid'));
    }

    public function deleteWebhook(string $externalId): void
    {
        $this->client()->delete($this->hookPath($externalId))->throw();
    }

    public function checkToken(): void
    {
        $this->assertTokenAccepted($this->client(), '/repositories/'.$this->target->owner.'/'.$this->target->repo);
    }

    private function hookPath(string $externalId = ''): string
    {
        $path = '/repositories/'.$this->target->owner.'/'.$this->target->repo.'/hooks';

        return $externalId === '' ? $path : $path.'/'.trim($externalId, '{}');
    }
}
