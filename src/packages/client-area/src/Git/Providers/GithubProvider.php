<?php

namespace PanelAlpha\ClientArea\Git\Providers;

use Illuminate\Http\Client\PendingRequest;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * GitHub repository webhooks (old `App\Lib\Apis\Github`).
 *
 * Permanent panel code: the panel registers the provider webhook itself, as
 * the old panel did, so this moved from client-area-legacy into the controller. Ported
 * from the old panel's `app/Lib/Apis/Github.php`.
 */
final class GithubProvider extends AbstractProvider
{
    private const API_VERSION = '2022-11-28';

    public function registerWebhook(string $callbackUrl, #[\SensitiveParameter] string $secret, ?string $branch, bool $insecureSsl): string
    {
        $response = $this->headers()->post($this->hookPath(), [
            'name' => 'web',
            'active' => true,
            'events' => ['push'],
            'config' => [
                'url' => $callbackUrl,
                'content_type' => 'json',
                'secret' => $secret,
                // GitHub takes the flag as a string ("1" disables verification).
                'insecure_ssl' => $insecureSsl ? '1' : '0',
            ],
        ]);

        return Payload::string($response->throw()->json('id'));
    }

    public function deleteWebhook(string $externalId): void
    {
        $this->headers()->delete($this->hookPath($externalId))->throw();
    }

    public function checkToken(): void
    {
        $this->assertTokenAccepted($this->headers(), '/repos/'.$this->target->owner.'/'.$this->target->repo);
    }

    private function hookPath(string $externalId = ''): string
    {
        $path = '/repos/'.$this->target->owner.'/'.$this->target->repo.'/hooks';

        return $externalId === '' ? $path : $path.'/'.$externalId;
    }

    /**
     * GitHub needs its API version header on top of the shared client.
     */
    private function headers(): PendingRequest
    {
        return $this->client()
            ->withHeader('X-GitHub-Api-Version', self::API_VERSION)
            ->withHeader('Accept', 'application/vnd.github+json');
    }
}
