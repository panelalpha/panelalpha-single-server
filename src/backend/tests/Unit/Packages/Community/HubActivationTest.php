<?php

namespace Tests\Unit\Packages\Community;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use PanelAlpha\Community\Hub\HubActivation;
use PanelAlpha\Community\Hub\PairingRejected;
use PanelAlpha\Hub\HubClient;
use PanelAlpha\Hub\HubPairing;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Unit\Packages\Hub\InMemoryHubSettings;
use Tests\Unit\Packages\Hub\StubHubPanel;
use Tests\TestCase;

/**
 * An approved Hub answer turned into the panel's pairing, and the first report
 * that confirms it. No database: the pairing is kept in memory.
 */
final class HubActivationTest extends TestCase
{
    private const HUB = 'https://hub.example.test';

    private InMemoryHubSettings $settings;

    private HubPairing $pairing;

    private HubActivation $activation;

    /** @var list<array{string, string, array<string, mixed>}> */
    private array $logs = [];

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => self::HUB]);
        $this->settings = new InMemoryHubSettings;
        $this->pairing = new HubPairing($this->settings);
        $this->activation = new HubActivation(new HubClient($this->pairing, new StubHubPanel), $this->pairing);

        Event::listen(MessageLogged::class, function (MessageLogged $event): void {
            $this->logs[] = [$event->level, $event->message, $event->context];
        });
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function answer(array $extra = []): array
    {
        return $extra + ['server_id' => 'srv_1', 'server_secret' => 'the-secret', 'hub_url' => self::HUB, 'account' => ['name' => 'Acme']];
    }

    public function test_a_complete_answer_gives_a_storer_that_pairs_the_panel(): void
    {
        $store = $this->activation->storer($this->answer(), 'https://panel.example.com');

        $this->assertNotNull($store);
        $this->assertFalse($this->pairing->isPaired(), 'nothing is stored before the storer runs');

        $store();

        $this->assertTrue($this->pairing->isPaired());
        $this->assertSame('srv_1', $this->pairing->serverId());
        $this->assertSame('the-secret', $this->pairing->serverSecret());
        $this->assertSame('https://panel.example.com', $this->pairing->adminUrl());
        $this->assertSame('Acme', $this->pairing->summary()['account_name']);
    }

    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public static function incompleteAnswers(): array
    {
        return [
            'no server id' => [['server_id' => '']],
            'no server secret' => [['server_secret' => '']],
            'a secret that is null' => [['server_secret' => null]],
        ];
    }

    /**
     * @param  array<string, mixed>  $override
     */
    #[DataProvider('incompleteAnswers')]
    public function test_an_answer_without_the_id_or_the_secret_gives_no_storer(array $override): void
    {
        $this->assertNull($this->activation->storer($this->answer($override), null));
        $this->assertFalse($this->pairing->isPaired());
    }

    public function test_a_hub_url_on_the_configured_hub_is_stored_as_its_origin(): void
    {
        $this->activation->storer($this->answer(['hub_url' => self::HUB.'/some/path?x=1']), null)();

        $this->assertSame(self::HUB, $this->pairing->hubUrl());
    }

    public function test_a_hub_url_outside_the_configured_hub_is_replaced_by_the_configured_one(): void
    {
        $this->activation->storer($this->answer(['hub_url' => 'https://hub.evil.test']), null)();
        $this->assertSame(self::HUB, $this->settings->values['hub.hub_url']);

        $this->settings->values = [];
        $this->activation->storer($this->answer(['hub_url' => 'javascript:alert(1)']), null)();
        $this->assertSame(self::HUB, $this->settings->values['hub.hub_url']);

        $this->settings->values = [];
        $this->activation->storer($this->answer(['hub_url' => null]), null)();
        $this->assertSame(self::HUB, $this->settings->values['hub.hub_url']);
    }

    public function test_an_answer_without_an_account_name_stores_none(): void
    {
        $this->activation->storer($this->answer(['account' => ['name' => 7]]), null)();
        $this->assertNull($this->pairing->summary()['account_name']);

        $this->settings->values = [];
        $this->activation->storer($this->answer(['account' => 'Acme']), null)();
        $this->assertNull($this->pairing->summary()['account_name']);
        $this->assertNull($this->pairing->adminUrl());
    }

    public function test_the_first_report_after_the_pairing_confirms_it(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, POST /api/panel/v1/report (src/packages/hub/docs/hub-connect-contract.md)
        Http::fake(['*' => Http::response([], 200)]);

        $reported = $this->activation->storeAndReport($this->activation->storer($this->answer(), null) ?? fn () => null);

        $this->assertTrue($reported);
        $this->assertTrue($this->pairing->isPaired());
    }

    public function test_a_5xx_on_the_first_report_keeps_the_pairing_and_says_it_was_not_reported(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, a 502 from a proxy in front of the Hub
        Http::fake(['*' => Http::response('', 502)]);

        $reported = $this->activation->storeAndReport($this->activation->storer($this->answer(), null) ?? fn () => null);

        $this->assertFalse($reported);
        $this->assertTrue($this->pairing->isPaired());
    }

    public function test_a_401_on_the_first_report_is_a_rejected_pairing(): void
    {
        // Defensive (not an Engine shape): PanelAlpha Hub contract 6, a 401 means the Hub does not accept this server
        Http::fake(['*' => Http::response(['error' => 'unknown_server'], 401)]);

        try {
            $this->activation->storeAndReport($this->activation->storer($this->answer(), null) ?? fn () => null);
            $this->fail('A 401 must throw PairingRejected.');
        } catch (PairingRejected $e) {
            $this->assertSame('The Hub did not accept the pairing.', $e->getMessage());
        }

        $this->assertFalse($this->pairing->isPaired());
    }

    public function test_an_unreachable_hub_on_the_first_report_is_logged_by_class_only(): void
    {
        // Defensive (not an Engine shape): Illuminate ConnectionException thrown by the HTTP client, its message carries the request URL
        Http::fake(fn () => throw new ConnectionException('cURL error 6: hub.example.test'));

        $this->pairing->store('srv_1', 's', self::HUB, null);
        $this->assertFalse($this->activation->sendFirstReport());

        $warning = collect($this->logs)->firstWhere(1, 'PanelAlpha Hub first report failed');
        $this->assertSame(['exception' => ConnectionException::class], $warning[2] ?? null);
    }
}
