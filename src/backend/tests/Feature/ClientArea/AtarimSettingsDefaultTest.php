<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Config\Repository;
use Illuminate\Foundation\Application;
use PanelAlpha\ClientArea\ClientAreaServiceProvider;
use PanelAlpha\ClientArea\Contracts\AtarimSettings;
use Tests\TestCase;

/**
 * The controller defaults the collaboration link's Atarim
 * settings to "off" with `bindIf()`, so an app that does not bind them (no host
 * settings table) answers the old 422 instead of failing to resolve; the host's
 * own binding still wins.
 */
class AtarimSettingsDefaultTest extends TestCase
{
    public function test_the_controller_alone_resolves_the_integration_as_disabled(): void
    {
        $app = new Application(base_path());
        $app->instance('config', new Repository([]));
        (new ClientAreaServiceProvider($app))->register();

        $settings = $app->make(AtarimSettings::class);

        $this->assertFalse($settings->enabled);
        $this->assertSame('', $settings->referralLink);
    }

    public function test_the_host_binding_wins_over_the_default(): void
    {
        $this->assertTrue($this->app->bound(AtarimSettings::class));
        // The host binds a closure that reads its settings table; with
        // `atarim-enabled` unset that is also disabled, so check the binding
        // is the host's, not the controller default, by its concrete closure.
        $binding = $this->app->getBindings()[AtarimSettings::class]['concrete'];
        $reflection = new \ReflectionFunction($binding);

        $this->assertStringContainsString('app/Providers/AppServiceProvider.php', (string) $reflection->getFileName());
    }
}
