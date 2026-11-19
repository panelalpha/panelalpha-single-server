<?php

namespace Tests\Unit\Packages\Hub;

use Illuminate\Console\Scheduling\Event as ScheduledEvent;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use PanelAlpha\Hub\Contracts\HubPanel;
use PanelAlpha\Hub\Contracts\HubSettings;
use PanelAlpha\Hub\HubEvents;
use PanelAlpha\Hub\HubPairing;
use Tests\TestCase;

/**
 * The monitoring-event outbox (`HubEvents`) and `hub:events`, contract §6a:
 * recorded while paired, delivered oldest first with their own time, kept
 * while the Hub cannot be reached, never sent to another pairing.
 */
final class HubEventsTest extends TestCase
{
    use RefreshDatabase;

    private const HUB = 'https://hub.example.test';

    private const EVENTS = self::HUB.'/api/panel/v1/events';

    /** @var list<array{string, string, array<string, mixed>}> */
    private array $logs = [];

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => self::HUB]);
        $this->app->instance(HubSettings::class, new InMemoryHubSettings);
        $this->app->instance(HubPanel::class, new StubHubPanel);
        $this->app->forgetInstance(HubPairing::class);

        Event::listen(MessageLogged::class, function (MessageLogged $event): void {
            $this->logs[] = [$event->level, $event->message, $event->context];
        });
    }

    private function pair(string $serverId = 'srv_1'): void
    {
        app(HubPairing::class)->store($serverId, 'the-secret', self::HUB, 'Acme', 'https://panel.example.com');
    }

    private function events(): HubEvents
    {
        return app(HubEvents::class);
    }

    public function test_events_are_sent_every_minute_without_overlap(): void
    {
        $events = collect($this->app->make(Schedule::class)->events())
            ->filter(fn (ScheduledEvent $e) => $e->description === 'hub-events');

        $this->assertCount(1, $events);
        $this->assertSame('* * * * *', $events->first()->expression);
        $this->assertTrue($events->first()->withoutOverlapping);
    }

    public function test_nothing_is_recorded_while_the_panel_is_not_paired(): void
    {
        $this->events()->record(HubEvents::APP_DOWN, '7', 'Shop', 'It stopped answering.');

        $this->assertSame(0, DB::table('hub_events')->count());
    }

    public function test_an_unknown_type_is_never_recorded(): void
    {
        $this->pair();

        $this->events()->record('server_down');

        $this->assertSame(0, DB::table('hub_events')->count());
    }

    public function test_a_signed_batch_carries_each_event_with_its_own_time_and_is_then_forgotten(): void
    {
        $this->pair();
        Carbon::setTestNow('2026-11-19 09:12:30');
        $this->events()->record(HubEvents::APP_DOWN, '1842', 'Shop', "HTTP 502\n from https://shop.example.com");
        Carbon::setTestNow('2026-11-19 09:20:00');
        $this->events()->record(HubEvents::BACKUP_SUCCEEDED);
        // Defensive (not an Engine shape): PanelAlpha Hub, POST /api/panel/v1/events answers 204 (src/packages/hub/docs/hub-connect-contract.md §6a)
        Http::fake([self::EVENTS => Http::response(null, 204)]);

        $this->artisan('hub:events')->expectsOutput('2 event(s) sent.')->assertSuccessful();

        Http::assertSent(function (Request $r): bool {
            $canonical = implode("\n", ['POST', 'api/panel/v1/events', $r->header('X-Timestamp')[0], hash('sha256', $r->body())]);

            return $r->url() === self::EVENTS
                && $r->header('X-Signature') === [hash_hmac('sha256', $canonical, 'the-secret')]
                && $r->data() === ['events' => [
                    ['event_type' => 'app_down', 'app_id' => '1842', 'app_name' => 'Shop', 'reason' => 'HTTP 502 from https://shop.example.com', 'occurred_at' => '2026-11-19T09:12:30Z'],
                    ['event_type' => 'backup_succeeded', 'app_id' => null, 'app_name' => null, 'reason' => null, 'occurred_at' => '2026-11-19T09:20:00Z'],
                ]];
        });
        $this->assertSame(0, DB::table('hub_events')->count());
    }

    public function test_events_wait_while_the_hub_cannot_be_reached(): void
    {
        $this->pair();
        $this->events()->record(HubEvents::APP_UP, '7', 'Shop');
        Http::fake(fn () => throw new ConnectionException('cURL error 7: hub.example.test'));

        $this->artisan('hub:events')->assertFailed();

        $this->assertSame(1, DB::table('hub_events')->count());
        $this->assertSame(['warning', 'PanelAlpha Hub events failed', ['exception' => ConnectionException::class]], end($this->logs));
    }

    public function test_events_wait_when_the_hub_fails_and_are_dropped_when_it_refuses_them(): void
    {
        $this->pair();
        $this->events()->record(HubEvents::APP_UP, '7', 'Shop');
        // Defensive (not an Engine shape): PanelAlpha Hub failing, then refusing the batch (422)
        Http::fake([self::EVENTS => Http::sequence()->push(['error' => 'unavailable'], 503)->push(['message' => 'invalid'], 422)]);

        $this->artisan('hub:events')->assertFailed();
        $this->assertSame(1, DB::table('hub_events')->count());

        $this->artisan('hub:events')->assertSuccessful();
        $this->assertSame(0, DB::table('hub_events')->count());
    }

    public function test_a_401_forgets_the_pairing_and_its_events(): void
    {
        $this->pair();
        $this->events()->record(HubEvents::APP_REMOVED, '7', 'Shop');
        // Defensive (not an Engine shape): PanelAlpha Hub, a 401 means it no longer knows this server
        Http::fake([self::EVENTS => Http::response(['error' => 'unknown_server'], 401)]);

        $this->artisan('hub:events')->assertSuccessful();

        $this->assertFalse(app(HubPairing::class)->isPaired());
        $this->assertSame(0, DB::table('hub_events')->count());
    }

    public function test_events_of_an_earlier_pairing_are_never_sent_to_the_next(): void
    {
        $this->pair('srv_old');
        $this->events()->record(HubEvents::APP_DOWN, '7', 'Shop');
        $this->pair('srv_new');
        $this->events()->record(HubEvents::APP_UP, '7', 'Shop');
        // Defensive (not an Engine shape): PanelAlpha Hub, POST /api/panel/v1/events answers 204
        Http::fake([self::EVENTS => Http::response(null, 204)]);

        $this->artisan('hub:events')->assertSuccessful();

        Http::assertSent(fn (Request $r): bool => array_column($r['events'], 'event_type') === ['app_up']);
    }

    public function test_a_long_outage_keeps_the_newest_thousand_and_drains_in_batches_of_two_hundred(): void
    {
        $this->pair();
        for ($i = 1; $i <= HubEvents::KEEP + 5; $i++) {
            $this->events()->record(HubEvents::APP_UP, (string) $i);
        }
        $this->assertSame(HubEvents::KEEP, DB::table('hub_events')->count());
        // Defensive (not an Engine shape): PanelAlpha Hub, POST /api/panel/v1/events answers 204
        Http::fake([self::EVENTS => Http::response(null, 204)]);

        $this->artisan('hub:events')->assertSuccessful();

        Http::assertSentCount(5);
        Http::assertSent(fn (Request $r): bool => count($r['events']) === HubEvents::BATCH && $r['events'][0]['app_id'] === '6');
        $this->assertSame(0, DB::table('hub_events')->count());
    }
}
