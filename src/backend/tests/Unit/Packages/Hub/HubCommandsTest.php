<?php

namespace Tests\Unit\Packages\Hub;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use PanelAlpha\Hub\Contracts\HubPanel;
use PanelAlpha\Hub\Contracts\HubSettings;
use PanelAlpha\Hub\HubPairing;
use Tests\TestCase;

/**
 * `hub:report` and `hub:disconnect` against an in-memory pairing store: what
 * the commands print, return and log, and what happens to the pairing.
 */
final class HubCommandsTest extends TestCase
{
    private const HUB = 'https://hub.example.test';

    private InMemoryHubSettings $settings;

    /** @var list<array{string, string, array<string, mixed>}> */
    private array $logs = [];

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => self::HUB]);
        $this->settings = new InMemoryHubSettings;
        $this->app->instance(HubSettings::class, $this->settings);
        $this->app->instance(HubPanel::class, new StubHubPanel);
        $this->app->forgetInstance(HubPairing::class);

        Event::listen(MessageLogged::class, function (MessageLogged $event): void {
            $this->logs[] = [$event->level, $event->message, $event->context];
        });
    }

    private function pair(): void
    {
        app(HubPairing::class)->store('srv_1', 'the-secret', self::HUB, 'Acme', 'https://panel.example.com');
    }

    public function test_the_report_does_nothing_while_the_panel_is_not_paired(): void
    {
        Http::fake();

        $this->artisan('hub:report')->expectsOutput('Not connected to PanelAlpha.')->assertSuccessful();

        Http::assertNothingSent();
    }

    public function test_an_accepted_report_says_so(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, POST /api/panel/v1/report (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(['*' => Http::response([], 200)]);
        $this->pair();

        $this->artisan('hub:report')->expectsOutput('Report sent, PanelAlpha answered 200.')->assertSuccessful();
    }

    public function test_a_401_removes_the_pairing_and_is_not_a_failure(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, a 401 means the Hub no longer knows this server
        Http::fake(['*' => Http::response(['error' => 'unknown_server'], 401)]);
        $this->pair();

        $this->artisan('hub:report')
            ->expectsOutput('PanelAlpha no longer knows this panel, the connection was removed.')
            ->assertSuccessful();

        $this->assertFalse(app(HubPairing::class)->isPaired());
    }

    public function test_a_rejected_report_fails_and_logs_the_status_and_error_but_not_the_body(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, a 422 names the error code of the refusal
        Http::fake(['*' => Http::response(['error' => 'invalid_apps', 'detail' => 'secret detail'], 422)]);
        $this->pair();

        $this->artisan('hub:report')->expectsOutput('Report sent, PanelAlpha answered 422.')->assertFailed();

        $warning = collect($this->logs)->firstWhere(1, 'PanelAlpha Hub rejected the report');
        $this->assertNotNull($warning);
        $this->assertSame('warning', $warning[0]);
        $this->assertSame(['status' => 422, 'error' => 'invalid_apps'], $warning[2]);
        $this->assertTrue(app(HubPairing::class)->isPaired());
    }

    public function test_a_rejected_report_without_an_error_code_logs_an_empty_one(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, a 503 from a proxy has no JSON body
        Http::fake(['*' => Http::response('<html>down</html>', 503)]);
        $this->pair();

        $this->artisan('hub:report')->assertFailed();

        $warning = collect($this->logs)->firstWhere(1, 'PanelAlpha Hub rejected the report');
        $this->assertSame(['status' => 503, 'error' => ''], $warning[2] ?? null);
    }

    public function test_an_unreachable_hub_fails_and_logs_only_the_exception_class(): void
    {
        // Defensive (not an Engine shape): Illuminate ConnectionException thrown by the HTTP client, its message carries the request URL
        Http::fake(fn () => throw new ConnectionException('cURL error 6: Could not resolve host: hub.example.test'));
        $this->pair();

        $this->artisan('hub:report')->assertFailed();

        $warning = collect($this->logs)->firstWhere(1, 'PanelAlpha Hub report failed');
        $this->assertSame(['exception' => ConnectionException::class], $warning[2] ?? null);
        $this->assertStringNotContainsString('hub.example.test', json_encode($this->logs, JSON_THROW_ON_ERROR));
    }

    public function test_disconnect_says_when_the_panel_was_not_connected(): void
    {
        Http::fake();

        $this->artisan('hub:disconnect')->expectsOutput('Not connected to PanelAlpha.')->assertSuccessful();

        Http::assertNothingSent();
    }

    public function test_disconnect_tells_the_hub_and_forgets_the_pairing(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, POST /api/panel/v1/disconnect (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(['*' => Http::response([], 200)]);
        $this->pair();

        $this->artisan('hub:disconnect')->expectsOutput('Disconnected from PanelAlpha.')->assertSuccessful();

        Http::assertSentCount(1);
        $this->assertSame([], $this->settings->values);
    }

    public function test_disconnect_forgets_the_pairing_even_when_the_hub_answers_an_error_or_is_unreachable(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, any answer to a disconnect leaves the panel disconnected
        Http::fake(['*' => Http::response('', 500)]);
        $this->pair();
        $this->artisan('hub:disconnect')->expectsOutput('Disconnected from PanelAlpha.')->assertSuccessful();
        $this->assertFalse(app(HubPairing::class)->isPaired());

        // Defensive (not an Engine shape): Illuminate ConnectionException thrown by the HTTP client, its message carries the request URL
        Http::fake(fn () => throw new ConnectionException('cURL error 7: refused http://hub.example.test'));
        $this->pair();
        $this->artisan('hub:disconnect')->assertSuccessful();
        $this->assertFalse(app(HubPairing::class)->isPaired());

        $warning = collect($this->logs)->firstWhere(1, 'PanelAlpha Hub disconnect failed');
        $this->assertSame(['exception' => ConnectionException::class], $warning[2] ?? null);
        $this->assertSame(0, Artisan::call('hub:disconnect'));
    }
}
