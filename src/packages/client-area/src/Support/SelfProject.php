<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Support\Facades\Cache;
use PanelAlpha\EngineClient\Api\TokensApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;

/**
 * The panel's own Engine project.
 *
 * v1 runs as an Engine project itself, so its own account is a normal project
 * on that Engine. The panel must never manage it: the sync does not import it
 * and every route bound to it answers 404, exactly like an unknown project.
 *
 * The operator's `PANELALPHA_SELF_PROJECT` wins. Without it the default Engine
 * names the project whose API access holds the panel's token
 * (`GET tokens/current`); the answer is cached per Engine URL and token.
 */
final class SelfProject
{
    private const int TTL_SECONDS = 86400;

    /**
     * How long a failed lookup is held before the Engine is asked again, so an
     * Engine without the endpoint is not asked on every request.
     */
    private const int RETRY_SECONDS = 60;

    private const int LOOKUP_TIMEOUT_SECONDS = 5;

    /**
     * The Engine username of the panel's own project, or null when neither the
     * install nor the Engine names one. Never throws; null disables the guard
     * rather than 404ing every project.
     */
    public static function username(): ?string
    {
        return self::override() ?? self::fromEngine();
    }

    /**
     * Whether a project username is the panel's own project. Exact match: the
     * Engine username is the unique key the sync mirrors.
     */
    public static function matches(?string $username): bool
    {
        $self = self::username();

        return $self !== null && $username === $self;
    }

    /**
     * Record what the Engine answered for this connection's token, so the next
     * read does not ask it again.
     */
    public static function remember(EngineClient $engine, ?string $project): void
    {
        Cache::put(self::key($engine), ['project' => $project], self::TTL_SECONDS);
    }

    private static function override(): ?string
    {
        return self::nonBlank(config('client-area.self_project'));
    }

    private static function fromEngine(): ?string
    {
        $engine = self::defaultEngine();
        if ($engine === null) {
            return null;
        }

        $key = self::key($engine);
        $cached = Payload::object(Cache::get($key));
        if (array_key_exists('project', $cached)) {
            return self::nonBlank($cached['project']);
        }

        return self::lookUp($engine, $key);
    }

    private static function lookUp(EngineClient $engine, string $key): ?string
    {
        try {
            $project = self::nonBlank(self::tokens($engine)->current()['project'] ?? null);
        } catch (EngineException|EngineValidationException|ProjectProtectedException) {
            Cache::put($key, ['project' => null], self::RETRY_SECONDS);

            return null;
        }

        self::remember($engine, $project);

        return $project;
    }

    private static function tokens(EngineClient $engine): TokensApi
    {
        return new TokensApi($engine->withTimeout(self::LOOKUP_TIMEOUT_SECONDS));
    }

    private static function defaultEngine(): ?EngineClient
    {
        $engines = app(EngineResolver::class);

        try {
            return $engines->forEngine($engines->defaultEngineId());
        } catch (EngineException) {
            return null;
        }
    }

    private static function key(EngineClient $engine): string
    {
        $connection = $engine->connection();

        return 'client-area:self-project:'.$connection->id.':'.hash('sha256', $connection->url."\n".$connection->token);
    }

    private static function nonBlank(mixed $value): ?string
    {
        $value = Payload::nullableString($value);

        return $value === null || $value === '' ? null : $value;
    }
}
