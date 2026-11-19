<?php

namespace PanelAlpha\EngineClient;

use Illuminate\Contracts\Container\Container;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Exceptions\EngineNotConfiguredException;

/**
 * EngineResolver for editions with exactly one Engine (Community, Pro).
 *
 * The host app decides where the credentials live by binding
 * EngineConnection in the container (src/backend reads them from settings).
 * The connection is resolved on every call, not at boot, so changed or
 * missing settings show up immediately as EngineNotConfiguredException.
 */
final class SingleEngineResolver implements EngineResolver
{
    public function __construct(private readonly Container $container) {}

    public function forEngine(int $engineId): EngineClient
    {
        if ($engineId !== EngineConnection::DEFAULT_ID) {
            throw new EngineNotConfiguredException("Engine #{$engineId} is not configured; this edition has a single Engine.");
        }

        return new EngineClient($this->connection());
    }

    public function defaultEngineId(): int
    {
        return EngineConnection::DEFAULT_ID;
    }

    public function engineIds(): array
    {
        return [EngineConnection::DEFAULT_ID];
    }

    private function connection(): EngineConnection
    {
        if (! $this->container->bound(EngineConnection::class)) {
            throw new EngineNotConfiguredException('No Engine connection is bound. The host app must bind '.EngineConnection::class.'.');
        }

        return $this->container->make(EngineConnection::class);
    }
}
