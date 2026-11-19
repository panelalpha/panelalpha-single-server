<?php

namespace App\Support;

use PanelAlpha\ClientArea\Contracts\CommunityPanel;
use PanelAlpha\ClientArea\Contracts\ServerIpv4Addresses;

/**
 * The Client Area's server IPv4 list, from the cached Engine system info
 * `/home` reads ({@see EngineSystemInfo::ipv4Addresses()}); no Engine call.
 *
 * Only the Community panel (one server, one Engine) has a server address that
 * is right for every project. Pro and Multi can have several Engines, addresses
 * per user, or no address on purpose, so there the list stays empty. Bound with
 * `scoped`: the cache is read once per request, not once per project.
 */
final class EngineServerIpv4Addresses implements ServerIpv4Addresses
{
    /** @var list<string>|null */
    private ?array $resolved = null;

    public function __construct(
        private readonly EngineSystemInfo $system,
        private readonly CommunityPanel $communityPanel,
    ) {}

    public function addresses(): array
    {
        return $this->resolved ??= $this->communityPanel->active()
            ? array_values(array_filter(
                $this->system->ipv4Addresses(),
                static fn (string $ip): bool => filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false,
            ))
            : [];
    }
}
