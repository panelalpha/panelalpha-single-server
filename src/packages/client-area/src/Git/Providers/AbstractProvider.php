<?php

namespace PanelAlpha\ClientArea\Git\Providers;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;
use PanelAlpha\ClientArea\Git\ProviderTarget;

/**
 * Shared HTTP plumbing for the provider APIs. The token is sent
 * as a bearer header and is never logged; every call fails on a non-2xx so the
 * caller can roll back.
 *
 * The API host was resolved once by the HostGuard before the client was built,
 * so every request is pinned to one of those addresses and never follows a
 * redirect to an unchecked host.
 *
 * Permanent panel code: the panel registers the provider webhook itself, as
 * the old panel did, so this moved from client-area-legacy into the controller.
 */
abstract class AbstractProvider implements GitProvider
{
    /**
     * @param  list<string>  $addresses  validated addresses of the API host (HostGuard)
     */
    public function __construct(
        protected readonly ProviderTarget $target,
        #[\SensitiveParameter] protected readonly string $token,
        protected readonly array $addresses,
    ) {
        if ($this->addresses === []) {
            throw new InvalidArgumentException('A git-provider client needs at least one validated address.');
        }
    }

    public function client(): PendingRequest
    {
        return Http::baseUrl($this->target->apiBase)
            ->withToken($this->token)
            ->acceptJson()
            ->asJson()
            ->timeout(30)
            ->withOptions(self::options($this->target, $this->addresses));
    }

    /**
     * Only the provider's 401 refuses a credential; any other answer leaves the decision to the repository read.
     *
     * @throws TokenRefusedException
     */
    protected function assertTokenAccepted(PendingRequest $request, string $path): void
    {
        if ($request->get($path)->status() === 401) {
            throw new TokenRefusedException();
        }
    }

    /**
     * The Guzzle options that pin the provider API call: curl skips DNS for the
     * API host and uses only the addresses the HostGuard validated, redirects
     * are never followed, and the timeout is the old panel's 30 s. An IPv6
     * address is bracketed, as curl's `CURLOPT_RESOLVE` requires.
     *
     * @param  list<string>  $addresses
     * @return array<string, mixed>
     */
    public static function options(ProviderTarget $target, array $addresses): array
    {
        $pinned = array_map(
            static fn (string $address): string => str_contains($address, ':') ? '['.$address.']' : $address,
            $addresses,
        );

        return [
            'allow_redirects' => false,
            'curl' => [CURLOPT_RESOLVE => [$target->apiHost().':443:'.implode(',', $pinned)]],
        ];
    }
}
