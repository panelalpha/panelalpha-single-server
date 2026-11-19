<?php

namespace Tests\Feature\ClientArea\Hosting;

use PanelAlpha\ClientArea\Hosting\DomainProbe;
use PanelAlpha\ClientArea\Hosting\PinnedProbe;
use PanelAlpha\ClientArea\Hosting\SslProbe;
use Tests\TestCase;

/**
 * The panel-side probes once moved to `client-area-legacy`, which bound them
 * as singletons. They are back in the controller (every certificate read is the Engine's
 * `ssl-check`; the reachability probe is panel code), which binds them with the
 * same lifetimes. No socket is opened – only the container bindings are
 * resolved.
 */
final class ProbeBindingTest extends TestCase
{
    public function test_the_controller_binds_the_pinned_probe_to_the_ssl_probe(): void
    {
        $this->assertInstanceOf(SslProbe::class, app(PinnedProbe::class));
        $this->assertSame(app(PinnedProbe::class), app(PinnedProbe::class));
    }

    public function test_no_panel_side_tls_socket_is_left(): void
    {
        // Certificates come from the Engine's installed-ssl-cert verdict; the
        // panel no longer opens a TLS handshake to read one.
        $this->assertFileDoesNotExist(base_path('../packages/client-area-legacy/src/Hosting/TlsSocket.php'));
        $this->assertFileDoesNotExist(base_path('../packages/client-area-legacy/src/Hosting/StreamTlsSocket.php'));
        $this->assertFileDoesNotExist(base_path('../packages/client-area/src/Hosting/TlsSocket.php'));
        $this->assertFileDoesNotExist(base_path('../packages/client-area/src/Hosting/StreamTlsSocket.php'));
        $this->assertFalse(method_exists(SslProbe::class, 'certificate'));
    }

    public function test_the_controller_binds_the_domain_probe_as_a_singleton(): void
    {
        $this->assertSame(app(DomainProbe::class), app(DomainProbe::class));
    }
}
