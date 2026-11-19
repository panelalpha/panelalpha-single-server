<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\LogService;
use PanelAlpha\ClientArea\Hosting\PreviewTunnelService;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Preview tunnel and log service paths the route tests do not reach: refusals
 * the Engine gives for a tunnel, an unreadable expiry and log reads that fail.
 */
class HostingServicesGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(): Application
    {
        return $this->syncedApplication(User::factory()->create(), 'site1');
    }

    // ---- PreviewTunnelService -------------------------------------------

    public function test_swap_host_keeps_a_value_that_has_no_host(): void
    {
        $this->assertSame('not a url', PreviewTunnelService::swapHost('not a url', 'preview-abc.tunnel.example.com'));
    }

    public function test_release_previews_of_an_empty_domain_calls_no_engine(): void
    {
        $application = $this->application();

        app(PreviewTunnelService::class)->releasePreviews($application, '');

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), 'tunnels'));
    }

    public function test_release_previews_rethrows_a_tunnel_list_failure_that_is_not_a_404(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/TunnelController.php:56 -> index() (Engine 5xx)
        Http::fake(['engine.example.com/api/projects/site1/domains/site1.example.com/tunnels' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        app(PreviewTunnelService::class)->releasePreviews($application, 'site1.example.com');
    }

    public function test_release_previews_skips_a_tunnel_that_is_already_gone_and_rethrows_other_failures(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/TunnelController.php:56 -> index()
        // Engine: core/app/Http/Controllers/User/TunnelController.php:236 -> destroy() (404 for the first, 500 for the second)
        Http::fake([
            'engine.example.com/api/projects/site1/domains/site1.example.com/tunnels' => Http::response(['data' => [
                ['hostname' => 'preview-aaaaaaaa.tunnel.example.com', 'purpose' => 'preview'],
                ['hostname' => 'preview-bbbbbbbb.tunnel.example.com', 'purpose' => 'preview'],
            ]]),
            'engine.example.com/api/projects/site1/domains/site1.example.com/tunnels/preview-aaaaaaaa.tunnel.example.com' => Http::response(['message' => 'gone'], 404),
            'engine.example.com/api/projects/site1/domains/site1.example.com/tunnels/preview-bbbbbbbb.tunnel.example.com' => Http::response(['message' => 'boom'], 500),
        ]);

        $this->expectException(EngineRequestException::class);

        app(PreviewTunnelService::class)->releasePreviews($application, 'site1.example.com');
    }

    public function test_a_tunnel_create_failure_that_is_not_a_busy_hostname_is_rethrown(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/TunnelController.php:56 -> index()
        // Engine: core/app/Http/Controllers/User/TunnelController.php:172 -> store() (Engine 5xx)
        Http::fake([
            'engine.example.com/api/projects/site1/domains/site1.example.com/tunnels' => function ($request) {
                return $request->method() === 'GET'
                    ? Http::response(['data' => []])
                    : Http::response(['message' => 'boom'], 500);
            },
        ]);

        $this->expectException(EngineRequestException::class);

        app(PreviewTunnelService::class)->tunnel($application);
    }

    public function test_a_tunnel_without_a_hostname_is_a_failed_create(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/TunnelController.php:56 -> index()
        // Engine: core/app/Http/Controllers/User/TunnelController.php:172 -> store() (a body without a hostname)
        Http::fake([
            'engine.example.com/api/projects/site1/domains/site1.example.com/tunnels' => function ($request) {
                return $request->method() === 'GET'
                    ? Http::response(['data' => []])
                    : Http::response(['data' => ['purpose' => 'preview']], 201);
            },
        ]);

        try {
            app(PreviewTunnelService::class)->tunnel($application);
            $this->fail('A tunnel without a hostname is not usable.');
        } catch (ValidationException $e) {
            $this->assertSame([PreviewTunnelService::CREATE_FAILED], $e->errors()[0]);
        }
    }

    public function test_a_tunnel_expiry_the_panel_cannot_read_is_no_expiry(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/TunnelController.php:56 -> index()
        // Engine: core/app/Http/Controllers/User/TunnelController.php:172 -> store() (valid_until that is not a date)
        Http::fake([
            'engine.example.com/api/projects/site1/domains/site1.example.com/tunnels' => function ($request) {
                return $request->method() === 'GET'
                    ? Http::response(['data' => []])
                    : Http::response(['data' => ['hostname' => 'preview-aaaaaaaa.tunnel.example.com', 'purpose' => 'preview', 'valid_until' => 'tomorrow-ish']], 201);
            },
        ]);

        $tunnel = app(PreviewTunnelService::class)->tunnel($application);

        $this->assertSame('preview-aaaaaaaa.tunnel.example.com', $tunnel['hostname']);
        $this->assertNull($tunnel['valid_until']);
    }

    // ---- LogService -----------------------------------------------------

    public function test_a_web_server_log_stream_refuses_a_file_name_with_a_slash(): void
    {
        $application = $this->application();

        try {
            app(LogService::class)->streamWebserverLog($application, '../secret', static function (): void {});
            $this->fail('A log file name with a slash must be refused.');
        } catch (HttpException|HttpResponseException $e) {
            $this->assertSame(422, $e instanceof HttpException ? $e->getStatusCode() : $e->getResponse()->getStatusCode());
        }
    }

    public function test_a_web_server_log_is_streamed_from_the_engine(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70 -> log file download
        Http::fake(['engine.example.com/api/projects/site1/domains/site1.example.com/log-files/access.log*' => Http::response('LINE-1', 200)]);

        $body = '';
        app(LogService::class)->streamWebserverLog($application, 'access.log', function ($stream) use (&$body): void {
            $body = (string) $stream;
        });

        $this->assertSame('LINE-1', $body);
    }

    public function test_the_wordpress_log_is_streamed_from_the_engine(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:753 -> files/download
        Http::fake(['engine.example.com/api/projects/site1/files/download*' => Http::response('WP-LOG', 200)]);

        $body = '';
        $streamed = app(LogService::class)->streamWordpressLog($application, function ($stream) use (&$body): void {
            $body = (string) $stream;
        });

        $this->assertTrue($streamed);
        $this->assertSame('WP-LOG', $body);
    }

    public function test_the_wordpress_log_stream_answers_false_when_the_engine_cannot_serve_it(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:753 -> files/download (404 for a missing file)
        Http::fake(['engine.example.com/api/projects/site1/files/download*' => Http::response(['message' => 'Invalid path'], 404)]);

        $this->assertFalse(app(LogService::class)->streamWordpressLog($application, static function (): void {}));
    }

    public function test_the_wordpress_log_read_rethrows_a_failure_that_is_not_a_404(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:753 -> files/download (Engine 5xx)
        Http::fake(['engine.example.com/api/projects/site1/files/download*' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        app(LogService::class)->wordpressLog($application);
    }

    public function test_the_wordpress_log_download_has_no_stream_when_the_file_is_missing(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:753 -> files/download (404 for a missing file)
        Http::fake(['engine.example.com/api/projects/site1/files/download*' => Http::response(['message' => 'Invalid path'], 404)]);

        $this->assertNull(app(LogService::class)->openWordpressLogStream($application));
    }
}
