<?php

namespace Tests\Unit\Packages\EngineClient;

use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Psr7\Request as PsrRequest;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Events\EngineCallFailed;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * How `EngineClient::send()` turns an Engine answer or a transport failure into
 * an exception and a circuit-breaker decision. No database: only the HTTP fake,
 * the cache and the event dispatcher.
 */
final class EngineClientErrorMappingTest extends TestCase
{
    private const URL = 'https://engine.example.com/api';

    private function client(?int $timeout = null): EngineClient
    {
        return new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, self::URL, '1|token', timeout: $timeout));
    }

    private function connectException(int $errno, float $connectTime = 0.0, string $primaryIp = ''): ConnectionException
    {
        $context = ['errno' => $errno, 'connect_time' => $connectTime, 'primary_ip' => $primaryIp];

        return new ConnectionException(
            "cURL error {$errno}",
            0,
            new ConnectException("cURL error {$errno}", new PsrRequest('GET', self::URL.'/projects/all'), null, $context),
        );
    }

    public function test_a_422_with_field_errors_and_problems_keeps_both_as_the_engine_sent_them(): void
    {
        // Engine: core/app/Exceptions/ProblemException.php:62
        Http::fake(['*' => Http::response([
            'message' => 'The domain is taken.',
            'errors' => ['domain' => ['The domain is taken.']],
            'problems' => [['field' => 'domain', 'code' => 'taken', 'message' => 'The domain is taken.']],
        ], 422)]);

        try {
            $this->client()->post('projects', ['domain' => 'x.test']);
            $this->fail('A 422 must throw EngineValidationException.');
        } catch (EngineValidationException $e) {
            $this->assertSame('The domain is taken.', $e->getMessage());
            $this->assertSame(['domain' => ['The domain is taken.']], $e->errors);
            $this->assertSame('taken', $e->problems[0]['code']);
            $this->assertSame(422, $e->response?->status());
        }
    }

    public function test_a_422_without_field_errors_keeps_the_message_under_engine(): void
    {
        // Engine: core/app/Exceptions/Handler.php:139
        Http::fake(['*' => Http::response(['message' => 'Container is not running.'], 422)]);

        try {
            $this->client()->get('projects/site1');
            $this->fail('A 422 must throw EngineValidationException.');
        } catch (EngineValidationException $e) {
            $this->assertSame(['engine' => ['Container is not running.']], $e->errors);
            $this->assertSame([], $e->problems);
        }
    }

    public function test_a_422_that_is_not_json_still_names_the_refusal(): void
    {
        // Defensive (not an Engine shape): a proxy in front of the Engine answers 422 with HTML
        Http::fake(['engine.example.com/*' => Http::response('<html>Unprocessable</html>', 422)]);

        try {
            $this->client()->get('projects/site1');
            $this->fail('A 422 must throw EngineValidationException.');
        } catch (EngineValidationException $e) {
            $this->assertSame('The Engine rejected the request.', $e->getMessage());
            $this->assertSame(['engine' => ['The Engine rejected the request.']], $e->errors);
        }
    }

    public function test_a_422_with_a_scalar_field_error_wraps_it_in_a_list(): void
    {
        // Defensive (not an Engine shape): the Engine documents every field as a list, an older build sent a string
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'bad', 'errors' => ['zip_path' => 'bad', 'tags' => ['a', 'b']]], 422)]);

        try {
            $this->client()->post('projects');
            $this->fail('A 422 must throw EngineValidationException.');
        } catch (EngineValidationException $e) {
            $this->assertSame(['zip_path' => ['bad'], 'tags' => ['a', 'b']], $e->errors);
        }
    }

    public function test_a_409_with_the_protected_code_is_a_project_protected_exception(): void
    {
        // Engine: core/app/Http/Middleware/EnsureProjectNotProtected.php:173
        Http::fake(['*' => Http::response(['message' => "Project 'site1' is protected.", 'code' => 'project_protected'], 409)]);

        try {
            $this->client()->delete('projects/site1');
            $this->fail('A protected refusal must throw ProjectProtectedException.');
        } catch (ProjectProtectedException $e) {
            $this->assertSame("Project 'site1' is protected.", $e->getMessage());
            $this->assertSame(409, $e->engineStatus);
            $this->assertSame('project_protected', $e->engineCode);
        }
    }

    public function test_a_protected_refusal_without_a_message_gets_a_neutral_one(): void
    {
        // Engine: core/app/Http/Middleware/EnsureProjectNotProtected.php:173
        Http::fake(['*' => Http::response(['code' => 'project_protected'], 409)]);

        try {
            $this->client()->delete('projects/site1');
            $this->fail('A protected refusal must throw ProjectProtectedException.');
        } catch (ProjectProtectedException $e) {
            $this->assertSame('The project is protected.', $e->getMessage());
        }
    }

    public function test_a_409_with_another_code_stays_an_engine_request_exception(): void
    {
        // Engine: core/app/Exceptions/Handler.php:106
        Http::fake(['*' => Http::response(['message' => 'A deploy is already running.'], 409)]);

        try {
            $this->client()->post('projects/site1/deploy');
            $this->fail('A 409 must throw EngineRequestException.');
        } catch (EngineRequestException $e) {
            $this->assertSame(409, $e->engineStatus);
            $this->assertSame('A deploy is already running.', $e->engineMessage);
            $this->assertNull($e->engineCode);
        }
    }

    public function test_a_409_refusal_keeps_its_code_and_problems(): void
    {
        // Engine: core/app/Exceptions/ProblemException.php:70
        Http::fake(['*' => Http::response([
            'message' => 'The project already has a source.',
            'code' => 'source_already_attached',
            'problems' => [['field' => 'source', 'code' => 'source_already_attached', 'message' => 'The project already has a source.']],
        ], 409)]);

        try {
            $this->client()->put('projects/site1/source');
            $this->fail('A 409 must throw EngineRequestException.');
        } catch (EngineRequestException $e) {
            $this->assertSame('source_already_attached', $e->engineCode);
            $this->assertSame('source', $e->problems[0]['field']);
        }
    }

    public function test_a_404_carries_the_engine_message_and_status(): void
    {
        // Engine: core/app/Exceptions/Handler.php:80
        Http::fake(['*' => Http::response(['message' => 'Project not found'], 404)]);

        try {
            $this->client()->get('projects/nobody');
            $this->fail('A 404 must throw EngineRequestException.');
        } catch (EngineRequestException $e) {
            $this->assertSame(404, $e->engineStatus);
            $this->assertSame('Project not found', $e->getMessage());
            $this->assertSame(404, $e->response?->status());
        }
    }

    /**
     * @return array<string, array{0: int, 1: string}>
     */
    public static function nonJsonErrorBodies(): array
    {
        return [
            'html 500' => [500, '<html><body>Internal Server Error</body></html>'],
            'empty 502' => [502, ''],
            'plain 504' => [504, 'upstream timed out'],
            'html 404' => [404, '<h1>Not Found</h1>'],
        ];
    }

    #[DataProvider('nonJsonErrorBodies')]
    public function test_an_error_answer_that_is_not_json_gets_a_neutral_message(int $status, string $body): void
    {
        // Defensive (not an Engine shape): nginx or a proxy answers before Laravel
        Http::fake(['engine.example.com/*' => Http::response($body, $status)]);

        try {
            $this->client()->get('projects/all');
            $this->fail('A non-2xx answer must throw.');
        } catch (EngineRequestException $e) {
            $this->assertSame($status, $e->engineStatus);
            $this->assertSame("Engine API request failed with HTTP {$status}.", $e->getMessage());
            $this->assertNull($e->engineMessage);
            $this->assertNull($e->engineCode);
            $this->assertSame([], $e->problems);
        }
    }

    public function test_an_empty_engine_message_is_replaced_by_the_neutral_one_but_kept_raw(): void
    {
        // Engine: core/app/Exceptions/Handler.php:106
        Http::fake(['*' => Http::response(['message' => ''], 500)]);

        try {
            $this->client()->get('projects/all');
            $this->fail('A 500 must throw.');
        } catch (EngineRequestException $e) {
            $this->assertSame('Engine API request failed with HTTP 500.', $e->getMessage());
            $this->assertSame('', $e->engineMessage);
        }
    }

    public function test_a_failed_answer_dispatches_engine_call_failed_with_the_status(): void
    {
        Event::fake([EngineCallFailed::class]);
        // Engine: core/app/Exceptions/Handler.php:80
        Http::fake(['*' => Http::response(['message' => 'Project not found'], 404)]);

        try {
            $this->client()->get('/projects/nobody');
        } catch (EngineRequestException) {
        }

        Event::assertDispatched(EngineCallFailed::class, static fn (EngineCallFailed $event): bool => $event->engineId === 1
            && $event->method === 'GET'
            && $event->path === 'projects/nobody'
            && $event->status === 404
            && ! $event->timedOut
            && ! $event->connectFailure
            && $event->message === 'Project not found'
            && ! $event->unreachable());
    }

    public function test_a_failed_answer_without_a_message_reports_the_neutral_text(): void
    {
        Event::fake([EngineCallFailed::class]);
        // Defensive (not an Engine shape): a proxy answers 502 with an empty body
        Http::fake(['engine.example.com/*' => Http::response('', 502)]);

        try {
            $this->client()->post('projects/all');
        } catch (EngineRequestException) {
        }

        Event::assertDispatched(EngineCallFailed::class, static fn (EngineCallFailed $event): bool => $event->method === 'POST'
            && $event->message === 'Engine API request failed with HTTP 502.');
    }

    public function test_a_successful_answer_dispatches_nothing(): void
    {
        Event::fake([EngineCallFailed::class]);
        // Engine: core/app/Http/Controllers/UserController.php:87
        Http::fake(['*' => Http::response(['data' => []])]);

        $this->client()->get('projects/all');

        Event::assertNotDispatched(EngineCallFailed::class);
    }

    public function test_a_transport_failure_is_an_unavailable_exception_and_an_event(): void
    {
        Event::fake([EngineCallFailed::class]);
        // Defensive (not an Engine shape): Guzzle ConnectException handler context (guzzlehttp/guzzle CurlFactory::createRejection), cURL error 7 refused
        Http::fake(fn () => throw $this->connectException(7));

        try {
            $this->client()->get('projects/all');
            $this->fail('A transport failure must throw EngineUnavailableException.');
        } catch (EngineUnavailableException $e) {
            $this->assertStringContainsString('Engine #1 is unreachable', $e->getMessage());
            $this->assertInstanceOf(ConnectionException::class, $e->getPrevious());
        }

        Event::assertDispatched(EngineCallFailed::class, static fn (EngineCallFailed $event): bool => $event->status === null
            && $event->unreachable()
            && $event->connectFailure
            && ! $event->timedOut);
    }

    /**
     * @return array<string, array{0: int, 1: float, 2: string, 3: bool, 4: bool}>
     */
    public static function transportFailures(): array
    {
        return [
            'dns failure (6)' => [6, 0.0, '', true, false],
            'refused (7)' => [7, 0.0, '', true, false],
            'timeout before any connect (28)' => [28, 0.0, '', true, true],
            'read timeout after connect_time (28)' => [28, 0.4, '', false, true],
            'read timeout with a primary ip (28)' => [28, 0.0, 'primary', false, true],
            'tls error (35)' => [35, 0.0, '', false, false],
        ];
    }

    #[DataProvider('transportFailures')]
    public function test_only_a_failure_before_any_connection_opens_the_circuit_breaker(int $errno, float $connectTime, string $primaryIp, bool $opens, bool $timedOut): void
    {
        Event::fake([EngineCallFailed::class]);
        // Defensive (not an Engine shape): Guzzle ConnectException handler context (guzzlehttp/guzzle CurlFactory::createRejection)
        Http::fake(fn () => throw $this->connectException($errno, $connectTime, $primaryIp === 'primary' ? 'IPV4' : ''));

        try {
            $this->client()->get('projects/all');
        } catch (EngineUnavailableException) {
        }

        $this->assertSame($opens, app(EngineHealth::class)->isDown(EngineConnection::DEFAULT_ID));
        Event::assertDispatched(EngineCallFailed::class, static fn (EngineCallFailed $event): bool => $event->timedOut === $timedOut
            && $event->connectFailure === $opens);
    }

    public function test_a_connection_exception_without_a_guzzle_cause_does_not_open_the_breaker(): void
    {
        // Defensive (not an Engine shape): Illuminate ConnectionException thrown by the HTTP client without a Guzzle cause
        Http::fake(fn () => throw new ConnectionException('Could not resolve host'));

        try {
            $this->client()->get('projects/all');
        } catch (EngineUnavailableException) {
        }

        $this->assertFalse(app(EngineHealth::class)->isDown(EngineConnection::DEFAULT_ID));
    }

    public function test_a_stream_call_maps_transport_failures_the_same_way(): void
    {
        // Defensive (not an Engine shape): Guzzle ConnectException handler context (guzzlehttp/guzzle CurlFactory::createRejection)
        Http::fake(fn () => throw $this->connectException(7));

        try {
            $this->client()->stream('GET', '/files/download', ['query' => ['path' => 'a']]);
            $this->fail('A transport failure must throw EngineUnavailableException.');
        } catch (EngineUnavailableException) {
        }

        $this->assertTrue(app(EngineHealth::class)->isDown(EngineConnection::DEFAULT_ID));
    }

    public function test_an_answer_below_500_closes_the_breaker_and_a_5xx_does_not(): void
    {
        $health = app(EngineHealth::class);
        $health->open(EngineConnection::DEFAULT_ID);
        // Engine: core/app/Exceptions/Handler.php:80
        Http::fake(['*' => Http::sequence()
            ->push(['message' => 'Project not found'], 404)
            ->push(['message' => 'ufw failed'], 502)]);

        try {
            $this->client()->get('projects/nobody');
        } catch (EngineRequestException) {
        }
        $this->assertFalse($health->isDown(EngineConnection::DEFAULT_ID));

        $health->open(EngineConnection::DEFAULT_ID);
        try {
            $this->client()->get('firewall/status');
        } catch (EngineRequestException) {
        }
        $this->assertTrue($health->isDown(EngineConnection::DEFAULT_ID));
    }

    public function test_the_call_timeout_is_the_clients_then_the_connections_then_thirty_seconds(): void
    {
        $timeouts = [];
        // Engine: core/app/Http/Controllers/UserController.php:87
        Http::fake(function ($request, array $options) use (&$timeouts) {
            $timeouts[] = $options['timeout'] ?? null;

            // Engine: core/app/Http/Controllers/UserController.php:87
            return Http::response(['data' => []]);
        });

        $plain = new EngineConnection(1, self::URL, 't');
        $slow = new EngineConnection(1, self::URL, 't', timeout: 12);
        (new EngineClient($plain))->get('a');
        (new EngineClient($slow))->get('b');
        (new EngineClient($slow))->withTimeout(77)->get('c');
        (new EngineClient($plain))->withTimeout(0)->get('d');

        $this->assertSame([EngineClient::DEFAULT_TIMEOUT_SECONDS, 12, 77, 1], $timeouts);
    }

    public function test_every_verb_sends_its_method_and_body(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:87
        Http::fake(['*' => Http::response(['data' => []])]);

        $client = $this->client();
        $client->get('p', ['a' => 1]);
        $client->post('p', ['b' => 2]);
        $client->put('p', ['c' => 3]);
        $client->delete('p', ['d' => 4]);

        $sent = Http::recorded()->map(static fn (array $pair): array => [$pair[0]->method(), $pair[0]->url(), $pair[0]->data()])->all();
        $this->assertSame([
            ['GET', self::URL.'/p?a=1', ['a' => 1]],
            ['POST', self::URL.'/p', ['b' => 2]],
            ['PUT', self::URL.'/p', ['c' => 3]],
            ['DELETE', self::URL.'/p', ['d' => 4]],
        ], $sent);
    }
}
