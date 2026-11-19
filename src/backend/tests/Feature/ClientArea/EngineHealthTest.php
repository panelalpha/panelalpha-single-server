<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Foundation\Testing\RefreshDatabase;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Psr7\Request as GuzzleRequest;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * The Engine-down policy for every fan-out: the per-Engine circuit breaker
 * opened by a connection error and closed by the next answering request or
 * after five minutes.
 */
class EngineHealthTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    /**
     * A Guzzle connect exception with the handler context the real client reads.
     * `errno` 6/7 never connected; errno 28 is a timeout whose `connect_time`
     * tells connect from read.
     */
    private function connectException(int $errno, float $connectTime = 0.0, ?string $primaryIp = null): ConnectException
    {
        $context = [
            'errno' => $errno,
            'connect_time' => $connectTime,
        ];
        if ($primaryIp !== null) {
            $context['primary_ip'] = $primaryIp;
        }

        return new ConnectException('cURL error '.$errno, new GuzzleRequest('GET', 'https://engine.example.com/api/system/info'), null, $context);
    }

    public function test_a_connection_error_opens_the_breaker_and_the_next_answer_closes_it(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        $this->assertFalse($health->isDown(1));

        // First call: a transport failure opens the breaker; the second call
        // answers and must close it again.
        $calls = 0;
        Http::fake([
            'engine.example.com/api/system/info' => function () use (&$calls) {
                $calls++;
                if ($calls === 1) {
                    // errno 7: TCP connect never completed.
                    throw $this->connectException(7);
                }

// Engine: core/app/Http/Controllers/SystemController.php:41
                return Http::response(['data' => []]);
            },
        ]);

        try {
            app(EngineResolver::class)->forEngine(1)->get('system/info');
            $this->fail('Expected EngineUnavailableException.');
        } catch (EngineUnavailableException) {
            // expected
        }

        $this->assertTrue($health->isDown(1));

        app(EngineResolver::class)->forEngine(1)->get('system/info');

        $this->assertFalse($health->isDown(1));
    }

    public function test_the_breaker_closes_after_five_minutes(): void
    {
        $health = app(EngineHealth::class);

        Carbon::setTestNow('2026-10-10 10:00:00');
        $health->open(1);
        $this->assertTrue($health->isDown(1));

        Carbon::setTestNow('2026-10-10 10:04:59');
        $this->assertTrue($health->isDown(1));

        Carbon::setTestNow('2026-10-10 10:05:00');
        $this->assertFalse($health->isDown(1));

        Carbon::setTestNow();
    }

    public function test_the_breaker_is_scoped_per_engine(): void
    {
        $health = app(EngineHealth::class);
        $health->open(1);

        // One Engine being down must not suppress another's fan-out.
        $this->assertTrue($health->isDown(1));
        $this->assertFalse($health->isDown(2));
    }

    public function test_a_stream_connection_error_opens_the_breaker(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        Http::fake(['engine.example.com/*' => fn () => throw $this->connectException(7)]);

        try {
            app(EngineResolver::class)->forEngine(1)->stream('GET', 'tasks/1/logs/stream');
            $this->fail('Expected EngineUnavailableException.');
        } catch (EngineUnavailableException) {
            // expected
        }

        // `stream()` opens the breaker like `send()`.
        $this->assertTrue($health->isDown(1));
    }

    public function test_a_stream_read_timeout_does_not_open_the_breaker(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        // errno 28 but connect_time > 0: the Engine answered too slowly. The
        // `stream()` gate must use the same connect-failure decision as
        // `send()`, not open on every ConnectionException.
        Http::fake(['engine.example.com/*' => fn () => throw $this->connectException(28, 1.5)]);

        try {
            app(EngineResolver::class)->forEngine(1)->stream('GET', 'tasks/1/logs/stream');
            $this->fail('Expected EngineUnavailableException.');
        } catch (EngineUnavailableException) {
            // expected
        }

        $this->assertFalse($health->isDown(1));
    }

    public function test_a_dns_failure_opens_the_breaker(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        Http::fake(['engine.example.com/*' => fn () => throw $this->connectException(6)]);

        try {
            app(EngineResolver::class)->forEngine(1)->get('system/info');
            $this->fail('Expected EngineUnavailableException.');
        } catch (EngineUnavailableException) {
            // expected
        }

        // Errno 6 means the host did not resolve: a connect failure.
        $this->assertTrue($health->isDown(1));
    }

    public function test_a_connect_timeout_opens_the_breaker(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        // Errno 28 with connect_time 0: the Engine never accepted a connection.
        Http::fake(['engine.example.com/*' => fn () => throw $this->connectException(28, 0.0)]);

        try {
            app(EngineResolver::class)->forEngine(1)->get('system/info');
            $this->fail('Expected EngineUnavailableException.');
        } catch (EngineUnavailableException) {
            // expected
        }

        $this->assertTrue($health->isDown(1));
    }

    public function test_a_read_timeout_does_not_open_the_breaker(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        // errno 28 but connect_time > 0: the Engine answered too slowly, it is
        // not down.
        Http::fake(['engine.example.com/*' => fn () => throw $this->connectException(28, 1.5)]);

        try {
            app(EngineResolver::class)->forEngine(1)->get('system/info');
            $this->fail('Expected EngineUnavailableException.');
        } catch (EngineUnavailableException) {
            // expected
        }

        // A long call reading nothing is not proof the Engine is down.
        $this->assertFalse($health->isDown(1));
    }

    public function test_a_connect_timeout_with_a_primary_ip_is_a_read_timeout(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        // errno 28 with connect_time 0 but a primary_ip: the Engine had an
        // address and the connection was up, so this is a read timeout, not
        // "down".
        Http::fake(['engine.example.com/*' => fn () => throw $this->connectException(28, 0.0, TestNetwork::PRIVATE_10)]);

        try {
            app(EngineResolver::class)->forEngine(1)->get('system/info');
            $this->fail('Expected EngineUnavailableException.');
        } catch (EngineUnavailableException) {
            // expected
        }

        $this->assertFalse($health->isDown(1));
    }

    public function test_an_unrelated_curl_error_does_not_open_the_breaker(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        // Guzzle wraps 35 (SSL connect) in a ConnectException too, but only 6/7
        // and a connect-timeout 28 mean the Engine is unreachable.
        Http::fake(['engine.example.com/*' => fn () => throw $this->connectException(35)]);

        try {
            app(EngineResolver::class)->forEngine(1)->get('system/info');
            $this->fail('Expected EngineUnavailableException.');
        } catch (EngineUnavailableException) {
            // expected
        }

        $this->assertFalse($health->isDown(1));
    }

    public function test_a_stream_4xx_answer_closes_the_breaker(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        $health->open(1);
        // Engine: core/app/Http/Controllers/Controller.php:19 (projectOr404 -> 404 {message}).
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'nope'], 404)]);

        try {
            app(EngineResolver::class)->forEngine(1)->stream('GET', 'tasks/1/logs/stream');
            $this->fail('Expected EngineRequestException.');
        } catch (EngineRequestException) {
            // expected
        }

        // `stream()` closes the breaker on a sub-500 answer like `send()`.
        $this->assertFalse($health->isDown(1));
    }

    public function test_a_stream_5xx_answer_does_not_close_the_breaker(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        $health->open(1);
        // Engine: core/app/Exceptions/Handler.php:114 (DockerErrorException -> 503 {message}).
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 503)]);

        try {
            app(EngineResolver::class)->forEngine(1)->stream('GET', 'tasks/1/logs/stream');
            $this->fail('Expected EngineRequestException.');
        } catch (EngineRequestException) {
            // expected
        }

        // Only a 2xx/4xx answer proves the Engine is healthy.
        $this->assertTrue($health->isDown(1));
    }

    public function test_a_5xx_answer_does_not_close_the_breaker(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        $health->open(1);
        // Engine: core/app/Exceptions/Handler.php:114 (DockerErrorException → 503 {message}).
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 503)]);

        try {
            app(EngineResolver::class)->forEngine(1)->get('system/info');
            $this->fail('Expected EngineRequestException.');
        } catch (EngineRequestException) {
            // expected
        }

        // Only a 2xx/4xx answer proves the Engine is healthy.
        $this->assertTrue($health->isDown(1));
    }

    public function test_a_4xx_answer_closes_the_breaker(): void
    {
        $this->configureEngine();
        $health = app(EngineHealth::class);
        $health->open(1);
        // Engine: core/app/Http/Controllers/Controller.php:19 (projectOr404 → 404 {message}).
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'nope'], 404)]);

        try {
            app(EngineResolver::class)->forEngine(1)->get('system/info');
            $this->fail('Expected EngineRequestException.');
        } catch (EngineRequestException) {
            // expected
        }

        $this->assertFalse($health->isDown(1));
    }

    public function test_close_skips_the_cache_write_when_the_key_is_absent(): void
    {
        $health = app(EngineHealth::class);
        Cache::spy();

        $health->close(1);

        // The usual request leaves nothing open: no forget write.
        Cache::shouldNotHaveReceived('forget');
    }
}
