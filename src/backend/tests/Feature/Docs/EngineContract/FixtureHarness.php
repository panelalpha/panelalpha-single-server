<?php

namespace Tests\Feature\Docs\EngineContract;

use Tests\Feature\ClientArea\EngineFixtures;

/**
 * Exposes the pure answer builders of {@see EngineFixtures}, so the guard can
 * build the same bodies the tests fake.
 */
final class FixtureHarness
{
    use EngineFixtures {
        engineDeploy as public;
        engineProject as public;
        engineUsage as public;
        engineTunnel as public;
        engineSslCertificate as public;
        engineSslCheck as public;
    }

    /** @var list<string> */
    public const BUILDERS = ['engineDeploy', 'engineProject', 'engineUsage', 'engineTunnel', 'engineSslCertificate', 'engineSslCheck'];
}
