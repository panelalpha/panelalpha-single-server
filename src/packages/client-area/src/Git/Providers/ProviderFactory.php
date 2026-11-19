<?php

namespace PanelAlpha\ClientArea\Git\Providers;

use InvalidArgumentException;
use PanelAlpha\ClientArea\Git\ProviderTarget;
use PanelAlpha\ClientArea\Hosting\HostGuard;

/**
 * Builds the webhook client for a repository's provider.
 *
 * A self-hosted provider sits on a user-controlled host, so the API host is
 * guarded and resolved once before the panel sends it the token; the client is
 * pinned to those addresses and follows no redirect.
 *
 * Permanent panel code: the panel registers the provider webhook itself, as
 * the old panel did, so this moved from client-area-legacy into the controller.
 */
final class ProviderFactory
{
    public function __construct(private readonly HostGuard $hosts) {}

    public function for(ProviderTarget $target, #[\SensitiveParameter] string $token): GitProvider
    {
        // Never the repository host: GitHub's API is api.github.com while the
        // repo lives on github.com. validatedAddresses() throws when blocked.
        $addresses = $this->hosts->validatedAddresses($target->apiHost());

        return match ($target->provider) {
            ProviderTarget::GITHUB => new GithubProvider($target, $token, $addresses),
            ProviderTarget::GITLAB => new GitlabProvider($target, $token, $addresses),
            ProviderTarget::BITBUCKET => new BitbucketProvider($target, $token, $addresses),
            default => throw new InvalidArgumentException("Unknown git provider [{$target->provider}]."),
        };
    }
}
