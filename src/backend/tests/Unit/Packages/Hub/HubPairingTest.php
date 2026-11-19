<?php

namespace Tests\Unit\Packages\Hub;

use Illuminate\Support\Facades\Crypt;
use PanelAlpha\Hub\HubPairing;
use Tests\TestCase;

/**
 * The panel's pairing with the Hub, kept in an in-memory settings store.
 */
final class HubPairingTest extends TestCase
{
    private InMemoryHubSettings $settings;

    private HubPairing $pairing;

    protected function setUp(): void
    {
        parent::setUp();

        config(['hub.url' => 'https://hub.example.test/']);
        $this->settings = new InMemoryHubSettings;
        $this->pairing = new HubPairing($this->settings);
    }

    public function test_a_new_panel_is_not_paired_and_uses_the_configured_hub(): void
    {
        $this->assertFalse($this->pairing->isPaired());
        $this->assertNull($this->pairing->serverId());
        $this->assertNull($this->pairing->serverSecret());
        $this->assertNull($this->pairing->adminUrl());
        $this->assertSame('https://hub.example.test', $this->pairing->hubUrl());
        $this->assertSame(
            ['paired' => false, 'hub_url' => 'https://hub.example.test', 'account_name' => null, 'connected_at' => null],
            $this->pairing->summary(),
        );
    }

    public function test_storing_a_pairing_encrypts_the_secret_and_trims_the_hub_url(): void
    {
        $this->travelTo('2026-11-09 10:00:00');

        $this->pairing->store('srv_1', 'the-secret', 'https://hub.other.test/', 'Acme', 'https://panel.example.com', '128');

        $this->assertTrue($this->pairing->isPaired());
        $this->assertSame('128', $this->pairing->hubUserId());
        $this->assertSame('srv_1', $this->pairing->serverId());
        $this->assertSame('the-secret', $this->pairing->serverSecret());
        $this->assertNotSame('the-secret', $this->settings->values['hub.server_secret']);
        $this->assertSame('the-secret', Crypt::decryptString($this->settings->values['hub.server_secret']));
        $this->assertSame('https://hub.other.test', $this->pairing->hubUrl());
        $this->assertSame('https://panel.example.com', $this->pairing->adminUrl());
        $this->assertSame('Acme', $this->pairing->summary()['account_name']);
        $this->assertSame(now()->toIso8601String(), $this->pairing->summary()['connected_at']);
    }

    public function test_a_pairing_without_account_or_admin_url_stores_empty_values_that_read_as_unset(): void
    {
        $this->pairing->store('srv_1', 'the-secret', 'https://hub.other.test', null);

        $this->assertTrue($this->pairing->isPaired());
        $this->assertNull($this->pairing->adminUrl());
        $this->assertNull($this->pairing->hubUserId());
        $this->assertNull($this->pairing->summary()['account_name']);
    }

    public function test_the_id_and_the_secret_are_stored_last(): void
    {
        $order = new InMemoryHubSettings;

        (new HubPairing($order))->store('srv_1', 's', 'https://hub.example.test', 'A', 'https://p.test');

        $this->assertSame(['hub.server_id', 'hub.server_secret'], array_slice($order->writes, -2));
    }

    public function test_a_stored_zero_or_empty_value_counts_as_unset(): void
    {
        $this->settings->values = ['hub.server_id' => '0', 'hub.server_secret' => ''];

        $this->assertFalse($this->pairing->isPaired());

        $this->settings->values = ['hub.server_id' => 'srv_1'];
        $this->assertFalse($this->pairing->isPaired(), 'the id alone is not a pairing');
    }

    public function test_a_moved_panel_updates_its_address_only_while_paired(): void
    {
        $this->pairing->updateAdminUrl('https://new.example.com');
        $this->assertNull($this->pairing->adminUrl());

        $this->pairing->store('srv_1', 's', 'https://hub.example.test', 'A', 'https://old.example.com');
        $this->pairing->updateAdminUrl('https://new.example.com');

        $this->assertSame('https://new.example.com', $this->pairing->adminUrl());
    }

    public function test_forgetting_removes_every_key_of_the_pairing(): void
    {
        $this->settings->values['unrelated'] = 'kept';
        $this->pairing->store('srv_1', 's', 'https://hub.other.test', 'A', 'https://p.test', '128');

        $this->pairing->forget();

        $this->assertSame(['unrelated' => 'kept'], $this->settings->values);
        $this->assertFalse($this->pairing->isPaired());
        $this->assertSame('https://hub.example.test', $this->pairing->hubUrl());
    }
}
