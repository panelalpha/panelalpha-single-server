<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\SystemApi;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineFeatures;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Reads the (single-server) Engine's own info.
 *
 * Used by the host app for things that are not about one project – where
 * projects without a domain land (sites_base_domain) and the server's IPv4
 * addresses – so /home can describe the "virtual service" without the Engine
 * project list. Missing credentials or a down Engine degrade to [] so the
 * Client Area still boots; the failure is reported.
 *
 * The Engine call goes through the package `SystemApi`/`EngineResolver` (never
 * a hand-built Engine client); caching stays here. The resolver is resolved
 * lazily so constructing this (e.g. for a guest /home) never throws when the
 * Engine is not configured yet.
 */
final class EngineSystemInfo
{
    /**
     * How long a cached payload counts as fresh; the scheduler refreshes it after
     * that. The value itself is kept without a TTL - `/home` must keep its data
     * through an outage of any length.
     */
    private const TTL_SECONDS = 300;

    public function __construct(private readonly EngineResolver $engines) {}

    /**
     * Read only the cache – `/home` must never call the Engine. The scheduler
     * refreshes it via `refresh()`.
     *
     * @return array<string, mixed>
     */
    public function get(): array
    {
        try {
            $engineId = $this->engines->forEngine(EngineConnection::DEFAULT_ID)->connection()->id;
        } catch (EngineException) {
            return [];
        }

        $cached = self::decodeObject(Cache::get($this->key($engineId)));
        if ($cached === null) {
            return [];
        }

        return self::decodeObject($cached['info'] ?? null) ?? [];
    }

    /**
     * Refresh the cache from the Engine (scheduler only). A failed refresh keeps
     * the last good value, and a value younger than the window is not fetched
     * again.
     */
    public function refresh(): void
    {
        try {
            $client = $this->engines->forEngine(EngineConnection::DEFAULT_ID);
        } catch (EngineException) {
            return;
        }

        $key = $this->key($client->connection()->id);
        $cached = self::decodeObject(Cache::get($key));

        if ($cached !== null
            && is_numeric($cached['fetched_at'] ?? null)
            && now()->getTimestamp() - (int) $cached['fetched_at'] < self::TTL_SECONDS
        ) {
            return;
        }

        try {
            $info = (new SystemApi($client))->info();
        } catch (EngineException $e) {
            report($e);

            return;
        }

        // The Engine's API features come with the same answer (engine-client
        // EngineFeatures, Engine 2.3.0).
        EngineFeatures::remember($client, $info);

        // No TTL: the previous value must outlive the outage, the timestamp
        // controls the next refresh.
        Cache::forever($key, [
            'fetched_at' => now()->getTimestamp(),
            'info' => $info,
        ]);
    }

    private function key(int $engineId): string
    {
        return 'host:engine-system-info:'.$engineId;
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function decodeObject(mixed $value): ?array
    {
        return is_array($value) ? Payload::object($value) : null;
    }

    /**
     * IPv4 addresses the Engine's projects bind to (fallback for a service
     * that has no hosting accounts yet).
     *
     * @return list<string>
     */
    public function ipv4Addresses(): array
    {
        $info = $this->get();
        $addresses = [];

        $defaultIpv4 = Payload::nullableString($info['default_ipv4'] ?? null);
        if ($defaultIpv4 !== null && $defaultIpv4 !== '') {
            $addresses[] = $defaultIpv4;
        }

        foreach (Payload::objects($info['ipv4_nat_maps'] ?? null) as $map) {
            $public = Payload::nullableString($map['public'] ?? $map['public_ip'] ?? null);
            if ($public !== null && $public !== '') {
                $addresses[] = $public;
            }
        }

        return array_values(array_unique($addresses));
    }

    /**
     * Base domain the Engine gives new projects without one of their own.
     */
    public function sitesBaseDomain(): ?string
    {
        $base = Payload::nullableString($this->get()['sites_base_domain'] ?? null);

        return $base !== null && $base !== '' ? $base : null;
    }
}
