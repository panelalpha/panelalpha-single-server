<?php

namespace Tests\Unit\Packages\Community;

use Illuminate\Foundation\Testing\RefreshDatabase;
use PanelAlpha\ClientArea\Contracts\HubLogin;
use PanelAlpha\ClientArea\Contracts\HubPairingStatus;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\Community\Hub\PairedHubLogin;
use PanelAlpha\Community\Hub\PanelSettingsHubStore;
use PanelAlpha\Community\Hub\SingleUserHubPairingStatus;
use PanelAlpha\Hub\HubPairing;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The three small Community classes around the pairing: the settings store, the
 * pairing status and "Sign in with PanelAlpha".
 */
final class HubPairingContractsTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    public function test_the_store_keeps_the_pairing_in_the_panel_settings(): void
    {
        $store = app(PanelSettingsHubStore::class);

        $this->assertNull($store->get('hub.server_id'));

        $store->set('hub.server_id', 'srv_1');
        $store->set('hub.hub_url', 'https://hub.example.test');

        $this->assertSame('srv_1', $store->get('hub.server_id'));
        $this->assertSame('srv_1', app(PanelSettings::class)->get('hub.server_id'));

        $store->forget('hub.server_id', 'hub.hub_url');

        $this->assertNull($store->get('hub.server_id'));
        $this->assertNull(app(PanelSettings::class)->get('hub.hub_url'));
    }

    public function test_the_store_is_what_the_pairing_uses(): void
    {
        app(HubPairing::class)->store('srv_1', 'secret', 'https://hub.example.test', 'Acme');

        $this->assertSame('srv_1', app(PanelSettings::class)->get('hub.server_id'));
        $this->assertTrue(app(HubPairingStatus::class)->paired());
    }

    public function test_the_status_and_the_login_follow_the_pairing_in_single_user_mode(): void
    {
        $status = app(SingleUserHubPairingStatus::class);
        $login = app(PairedHubLogin::class);

        $this->assertFalse($status->paired());
        $this->assertFalse($login->available());
        $this->assertInstanceOf(PairedHubLogin::class, app(HubLogin::class));

        // A pairing that names no approving Hub user offers no Hub sign-in.
        app(HubPairing::class)->store('srv_1', 'secret', 'https://hub.example.test', 'Acme');

        $this->assertTrue($status->paired());
        $this->assertFalse($login->available());

        app(HubPairing::class)->store('srv_1', 'secret', 'https://hub.example.test', 'Acme', null, '128');

        $this->assertTrue($status->paired());
        $this->assertTrue($login->available());

        app(HubPairing::class)->forget();

        $this->assertFalse($status->paired());
        $this->assertFalse($login->available());
    }

    public function test_a_multi_user_edition_is_never_paired_or_offered_the_hub_login(): void
    {
        app(HubPairing::class)->store('srv_1', 'secret', 'https://hub.example.test', 'Acme');
        $this->bindMultiUserEdition([]);

        $this->assertFalse(app(SingleUserHubPairingStatus::class)->paired());
        $this->assertFalse(app(PairedHubLogin::class)->available());
    }
}
