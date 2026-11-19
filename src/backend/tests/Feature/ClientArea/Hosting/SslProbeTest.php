<?php

namespace Tests\Feature\ClientArea\Hosting;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Hosting\SslProbe;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The TLS probe's address side is injectable so a test asserts the pinned
 * target without a socket. The guarded
 * `forHostname()` variant had no production caller and was removed.
 */
class SslProbeTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_the_unused_ssl_prober_interface_is_gone(): void
    {
        // The interface existed only for a guarded hostname probe
        // that nothing called; deleting it is pinned here so dead code cannot
        // creep back unnoticed. Check the file (not interface_exists, which
        // would autoload a classmap entry pointing at the removed file).
        $this->assertFileDoesNotExist(base_path('../packages/client-area/src/Hosting/SslProber.php'));
        $this->assertFileDoesNotExist(base_path('../packages/client-area-legacy/src/Hosting/SslProber.php'));
        $this->assertFalse(method_exists(SslProbe::class, 'forHostname'));
    }

    public function test_ipv6_endpoints_are_bracketed(): void
    {
        $this->assertSame('[2606:4700:4700::1111]', SslProbe::endpoint('2606:4700:4700::1111'));
        $this->assertSame(TestNetwork::routable(34), SslProbe::endpoint(TestNetwork::routable(34)));
    }

    public function test_an_https_probe_is_pinned_to_the_resolved_address_and_follows_no_redirect(): void
    {
        // Old DomainController::resolve used CURLOPT_RESOLVE with the server
        // account's IP (packages/api/app/Http/Controllers/User/DomainController
        // .php:456); following a redirect to an unchecked host is forbidden too.
        $ipv4 = SslProbe::pinOptions('site1.example.com', TestNetwork::routable(34));
        $this->assertSame(['site1.example.com:443:'.TestNetwork::routable(34)], $ipv4['curl'][CURLOPT_RESOLVE]);
        $this->assertFalse($ipv4['allow_redirects']);

        // An IPv6 pin is bracketed, as curl's CURLOPT_RESOLVE requires.
        $ipv6 = SslProbe::pinOptions('site1.example.com', '2606:4700:4700::1111');
        $this->assertSame(['site1.example.com:443:[2606:4700:4700::1111]'], $ipv6['curl'][CURLOPT_RESOLVE]);
    }

    public function test_https_status_returns_the_engine_answer_for_the_pinned_request(): void
    {
        $this->configureEngine();
        // External: panel-side TLS probe; not an Engine call
        Http::fake(['https://site1.example.com/' => Http::response('', 302)]);

        $probe = app(SslProbe::class);
        $this->assertSame(302, $probe->httpsStatus('site1.example.com', TestNetwork::routable(34)));

        Http::assertSent(fn ($request) => $request->method() === 'GET'
            && $request->url() === 'https://site1.example.com/');

        // Nothing answered → null, never a status from the redirect target.
        Http::fake(fn () => throw new ConnectionException('down'));
        $this->assertNull($probe->httpsStatus('site1.example.com', TestNetwork::routable(34)));
    }
}
