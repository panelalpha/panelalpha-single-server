<?php

namespace PanelAlpha\EngineClient;

use Illuminate\Support\Facades\Cache;
use PanelAlpha\EngineClient\Api\SystemApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * What one Engine's API can do that an older one cannot (`GET system/info`
 * `features`, Engine 2.3.0 core/app/Lib/Host/ApiFeatures.php). An Engine without the
 * list has none of them.
 *
 * The answer is cached per Engine connection (id and URL), so a panel that
 * talks to Engines of several versions decides per Engine, and an Engine
 * update is picked up within the TTL. A failed read is not cached.
 *
 * It is answered with the last features that Engine itself listed, kept beside
 * the TTL cache for a week. That answer alone decides which Engine calls the
 * panel makes, so a `system/info` hiccup must not switch a 2.3.0 Engine back to
 * the older calls: `CopyProjectJob` would hold an HTTP request open for the
 * synchronous clone (`ProjectsApi::clone()`, up to
 * `EngineClient::LONG_TIMEOUT_SECONDS`) and the creates and git attaches would
 * take the flat bodies. An Engine that really drops a feature still loses it at
 * the next answer it gives, a downgrade included: a read that succeeds
 * overwrites the last known good one. An Engine never read successfully has
 * nothing to fall back to and stays "no features", as every older Engine does.
 */
final class EngineFeatures
{
    /**
     * The typed `POST /projects` body with `source`, `PUT
     * /projects/{u}/source`, `/uploads`, `POST /vault/deploy-keys` and `source`
     * on a project read (Engine 2.3.0, `ApiFeatures::PROJECT_SOURCE`).
     */
    public const PROJECT_SOURCE = 'project_source';

    private const TTL_SECONDS = 600;

    /**
     * How long the last answer an Engine gave outlives the TTL cache, so an
     * outage of any length keeps the calls the panel already made.
     */
    private const LAST_KNOWN_GOOD_TTL_SECONDS = 604800;

    public static function supports(EngineClient $engine, string $feature): bool
    {
        return in_array($feature, self::of($engine), true);
    }

    /**
     * @return list<string>
     */
    public static function of(EngineClient $engine): array
    {
        $cached = Payload::object(Cache::get(self::key($engine)));
        if (array_key_exists('features', $cached)) {
            return Payload::strings($cached['features']);
        }

        try {
            $features = (new SystemApi($engine))->features();
        } catch (EngineException|EngineValidationException) {
            return self::lastKnownGood($engine);
        }

        self::rememberFeatures($engine, $features);

        return $features;
    }

    /**
     * Record the features of a `system/info` the caller read anyway (the
     * host's scheduled refresh), so the next check does not read it again.
     *
     * @param  array<string, mixed>  $info  the `data` of `GET system/info`
     */
    public static function remember(EngineClient $engine, array $info): void
    {
        self::rememberFeatures($engine, Payload::strings($info['features'] ?? []));
    }

    /**
     * What the Engine last answered, for a read that failed: a week old is
     * still a better guess at its API than "an older Engine".
     *
     * @return list<string>
     */
    private static function lastKnownGood(EngineClient $engine): array
    {
        $cached = Payload::object(Cache::get(self::lastKnownGoodKey($engine)));
        if (array_key_exists('features', $cached)) {
            return Payload::strings($cached['features']);
        }

        return [];
    }

    /**
     * @param  list<string>  $features
     */
    private static function rememberFeatures(EngineClient $engine, array $features): void
    {
        Cache::put(self::key($engine), ['features' => $features], self::TTL_SECONDS);
        Cache::put(self::lastKnownGoodKey($engine), ['features' => $features], self::LAST_KNOWN_GOOD_TTL_SECONDS);
    }

    private static function key(EngineClient $engine): string
    {
        return 'engine-client:features:'.self::connectionKey($engine);
    }

    private static function lastKnownGoodKey(EngineClient $engine): string
    {
        return 'engine-client:features-last-known-good:'.self::connectionKey($engine);
    }

    private static function connectionKey(EngineClient $engine): string
    {
        $connection = $engine->connection();

        return $connection->id.':'.md5($connection->url);
    }
}
