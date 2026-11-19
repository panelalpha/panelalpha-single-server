<?php

namespace Tests\Feature\Community\Gaps;

use Illuminate\Foundation\Testing\RefreshDatabase;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\Community\Settings\PanelAddressMove;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * PanelAddressMove refusals the Settings tests do not reach: an Engine that
 * fails while the domain is added or changed, a server name the Engine cannot
 * report, and the owner's message for each refusal.
 */
class PanelAddressMoveGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const SELF = 'panelv1';

    private const MAIN = 'panelv1.example.com';

    protected function setUp(): void
    {
        parent::setUp();
        $this->configureEngine();
        config(['client-area.self_project' => self::SELF]);
    }

    private function move(string $host, int $port = 443): bool
    {
        return app(PanelAddressMove::class)->move($host, $port);
    }

    /**
     * The Engine for the panel's own project: it lists the main domain, and each
     * of the other calls answers what `$answers` says for `METHOD path-suffix`.
     *
     * @param  array<string, mixed>  $answers  a fake response (or a closure) per key
     */
    private function fakeEngine(array $answers = []): void
    {
        Http::fake(function (Request $request) use ($answers) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $key = $request->method().' '.substr($path, strlen('/api/projects/'.self::SELF));

            if ($path === '/api/system/info') {
                // Engine: core/app/Http/Controllers/SystemController.php:47 -> info, `cert_domain` is the server's own name
                return $answers['system/info'] ?? Http::response(['data' => ['cert_domain' => 'server.example.net']]);
            }
            if ($key === 'GET /domains') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:53 -> domains list
                return Http::response(['data' => [[
                    'id' => 1, 'domain' => self::MAIN, 'type' => 'main',
                    'details' => ['aliases' => [], 'https_ports' => [443], 'https_port' => 443],
                ]]]);
            }
            if (isset($answers[$key])) {
                return $answers[$key];
            }

            // Engine: core/app/Http/Controllers/User/DomainController.php:282 -> store; :361 -> update; :432 -> destroy
            return Http::response(['data' => [], 'files_kept' => []]);
        });
    }

    public function test_an_engine_that_fails_to_add_the_domain_is_a_502(): void
    {
        // Engine: core/app/Http/Controllers/User/DomainController.php:282 -> store (Engine 5xx)
        $this->fakeEngine(['POST /domains' => Http::response(['message' => 'boom'], 500)]);

        try {
            $this->move('new.example.com');
            $this->fail('A failed domain create must stop the move.');
        } catch (HttpException $e) {
            $this->assertSame(502, $e->getStatusCode());
            $this->assertSame(PanelAddressMove::ENGINE_FAILED, $e->getMessage());
        }
    }

    public function test_an_engine_that_is_down_while_the_domain_is_changed_is_a_502(): void
    {
        // Engine: core/app/Http/Controllers/User/DomainController.php:361 -> update (the connection fails)
        $this->fakeEngine(['PUT /domains/new.example.com' => Http::failedConnection()]);

        try {
            $this->move('new.example.com');
            $this->fail('A failed domain change must stop the move.');
        } catch (HttpException $e) {
            $this->assertSame(502, $e->getStatusCode());
            $this->assertSame(PanelAddressMove::ENGINE_FAILED, $e->getMessage());
        }
    }

    public function test_an_engine_that_is_busy_while_the_domain_is_changed_is_a_409(): void
    {
        // Engine: core/app/Http/Controllers/User/DomainController.php:361 -> update (409, a deploy is running)
        $this->fakeEngine(['PUT /domains/new.example.com' => Http::response(['message' => 'A deploy is already running.', 'code' => 'deploy_busy'], 409)]);

        try {
            $this->move('new.example.com');
            $this->fail('A busy Engine must stop the move.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
            $this->assertSame(PanelAddressMove::BUSY, $e->getMessage());
        }
    }

    public function test_a_server_name_the_engine_cannot_report_still_lets_the_move_ask_for_a_certificate(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:47 -> info (Engine 5xx)
        $this->fakeEngine(['system/info' => Http::response(['message' => 'boom'], 500)]);

        $this->assertTrue($this->move('new.example.com'));

        Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/domains/new.example.com/request-ssl-cert'));
    }

    public function test_the_servers_own_name_gets_no_certificate_request(): void
    {
        $this->fakeEngine();

        $this->assertTrue($this->move('server.example.net'));

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/request-ssl-cert'));
    }

    public function test_a_port_the_server_does_not_allow_names_the_command_for_the_operator(): void
    {
        // Engine: core/app/Http/Controllers/User/DomainController.php:361 -> update (422, problems[].code https_port_not_allowed)
        $this->fakeEngine(['PUT /domains/new.example.com' => Http::response([
            'message' => 'The port is not allowed.',
            'errors' => ['https_ports' => ['The port is not allowed.']],
            'problems' => [['field' => 'https_ports', 'code' => 'https_port_not_allowed', 'message' => 'The port is not allowed.', 'hints' => []]],
        ], 422)]);

        try {
            $this->move('new.example.com', 8443);
            $this->fail('A port the server does not allow must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame([sprintf(PanelAddressMove::PORTS_NOT_ALLOWED, self::SELF)], $e->errors()['url']);
        }
    }

    public function test_the_servers_own_name_as_an_address_names_the_command_for_the_operator(): void
    {
        // Engine: core/app/Http/Controllers/User/DomainController.php:282 -> store (422, problems[].code host_domain_not_allowed)
        $this->fakeEngine(['POST /domains' => Http::response([
            'message' => 'The name is reserved.',
            'errors' => ['domain' => ['The name is reserved.']],
            'problems' => [['field' => 'domain', 'code' => 'host_domain_not_allowed', 'message' => 'The name is reserved.', 'hints' => []]],
        ], 422)]);

        try {
            $this->move('new.example.com');
            $this->fail('The server name must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame([sprintf(PanelAddressMove::HOST_NOT_ALLOWED, 'new.example.com', self::SELF)], $e->errors()['url']);
        }
    }

    /** A name under a shared zone: the Engine's text reads the panel's own sentence. */
    public function test_a_certificate_refused_under_a_shared_zone_reads_the_panels_sentence(): void
    {
        // Engine: core/app/Http/Controllers/User/DomainController.php:511-516 (422, message only)
        $this->fakeEngine(['POST /domains/new.example.com/request-ssl-cert' => Http::response([
            'message' => 'Could not obtain a certificate for new.example.com: new.example.com is under example.com, a zone every engine in the fleet issues under and shares one 50-certificate weekly limit on. Set shared_zone_issuance to obtain one anyway, or give the project a domain you own.',
        ], 422)]);

        try {
            $this->move('new.example.com');
            $this->fail('A refused certificate must stop the move.');
        } catch (ValidationException $e) {
            $this->assertSame(EngineText::SHARED_ZONE_REFUSED, $e->errors()['url'][0]);
        }
    }

    public function test_an_engine_that_cannot_issue_the_certificate_without_a_reason_says_so_in_the_panels_words(): void
    {
        // Engine: core/app/Http/Controllers/User/DomainController.php:505 -> requestSslCert (422 without a message)
        $this->fakeEngine(['POST /domains/new.example.com/request-ssl-cert' => Http::response(['errors' => ['domain' => ['']]], 422)]);

        try {
            $this->move('new.example.com');
            $this->fail('A refused certificate must stop the move.');
        } catch (ValidationException $e) {
            $this->assertNotEmpty($e->errors()['url'][0]);
        }
    }

    public function test_a_domain_the_engine_made_the_main_one_before_it_failed_stays(): void
    {
        $lists = 0;
        $this->fakeFailingMove(function (string $method) use (&$lists): ?PromiseInterface {
            if ($method !== 'GET') {
                return null;
            }

            // Engine: core/app/Http/Controllers/User/DomainController.php:53 -> index, {data:[DomainResource]}: the
            // update made the new domain the main one before it failed.
            return ++$lists === 1
                ? $this->domainsAnswer([[self::MAIN, 'main']])
                : $this->domainsAnswer([[self::MAIN, 'addon'], ['new.example.com', 'main']]);
        });

        try {
            $this->move('new.example.com');
            $this->fail('A failed move must stop.');
        } catch (HttpException $e) {
            $this->assertSame(502, $e->getStatusCode());
        }

        // The new domain is the project's address now: it is not the attempt's leftover.
        Http::assertNotSent(fn (Request $request): bool => $request->method() === 'DELETE');
    }

    public function test_a_failed_move_whose_domain_list_cannot_be_read_leaves_the_domain_and_warns(): void
    {
        Log::spy();
        $lists = 0;
        $this->fakeFailingMove(function (string $method) use (&$lists): ?PromiseInterface {
            if ($method !== 'GET') {
                return null;
            }

            // Engine: core/app/Http/Controllers/User/DomainController.php:53 -> index (the second read fails)
            return ++$lists === 1 ? $this->domainsAnswer([[self::MAIN, 'main']]) : Http::response(['message' => 'boom'], 500);
        });

        try {
            $this->move('new.example.com');
            $this->fail('A failed move must stop.');
        } catch (HttpException $e) {
            $this->assertSame(502, $e->getStatusCode());
        }

        Http::assertNotSent(fn (Request $request): bool => $request->method() === 'DELETE');
        Log::shouldHaveReceived('warning')
            ->withArgs(fn (string $message, array $context): bool => $context['domain'] === 'new.example.com')
            ->once();
    }

    /**
     * An Engine whose domain list, create, certificate and update answers `$answer` decides; the rest fails as an
     * Engine 5xx. The update always fails: only the cleanup after it differs.
     *
     * @param  callable(string): ?PromiseInterface  $answer
     */
    private function fakeFailingMove(callable $answer): void
    {
        Http::fake(function (Request $request) use ($answer) {
            $path = (string) parse_url($request->url(), PHP_URL_PATH);
            $method = $request->method();

            if ($path === '/api/system/info') {
                // Engine: core/app/Http/Controllers/SystemController.php:47 -> info, `cert_domain` is the server's own name
                return Http::response(['data' => ['cert_domain' => 'server.example.net']], 200);
            }
            $answered = $answer($method);
            if ($answered !== null) {
                return $answered;
            }
            if ($method === 'POST' && str_ends_with($path, '/request-ssl-cert')) {
                // Engine: core/app/Http/Controllers/User/DomainController.php:505 -> requestSslCert
                return Http::response(['data' => ['status' => 'requested']], 200);
            }
            if ($method === 'POST') {
                // Engine: core/app/Http/Controllers/User/DomainController.php:282 -> store, DomainResource (unwrapped)
                return Http::response(['id' => 9, 'domain' => 'new.example.com', 'type' => 'addon'], 200);
            }

            // Engine: core/app/Http/Controllers/User/DomainController.php:361 -> update (5xx)
            return Http::response(['message' => 'boom'], 500);
        });
    }

    /**
     * @param  list<array{string, string}>  $rows  domain and type
     */
    private function domainsAnswer(array $rows): PromiseInterface
    {
        // Engine: core/app/Http/Controllers/User/DomainController.php:53 -> index, {data:[DomainResource]}
        return Http::response(['data' => array_map(fn (array $row, int $id): array => [
            'id' => $id + 1, 'domain' => $row[0], 'type' => $row[1],
            'details' => ['aliases' => [], 'https_ports' => [443], 'https_port' => 443],
        ], $rows, array_keys($rows))], 200);
    }
}
