<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Support\HomePayload;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PanelAlpha\ClientArea\Contracts\HomeAdminBlock;
use PanelAlpha\ClientArea\Contracts\PanelLanguages;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use Tests\TestCase;

/**
 * The host binds the settings table and the language list for packages that
 * need them (the paid Admin Area).
 */
final class PanelContractsTest extends TestCase
{
    use RefreshDatabase;

    public function test_panel_settings_read_and_write_the_settings_table(): void
    {
        $settings = app(PanelSettings::class);

        $this->assertSame('fallback', $settings->get('userapp.name', 'fallback'));
        $settings->set('userapp.name', 'Acme');

        $this->assertSame('Acme', $settings->get('userapp.name'));
        $this->assertSame('Acme', Setting::get('userapp.name'));
    }

    public function test_panel_languages_are_the_home_lists(): void
    {
        $languages = app(PanelLanguages::class);

        $this->assertSame(HomePayload::languages(), $languages->codes());
        $this->assertContains('en', $languages->codes());
        $this->assertSame(HomePayload::languageFlags(HomePayload::languages()), $languages->flags());
    }

    public function test_community_has_no_home_admin_block(): void
    {
        // Community has no admin; the paid Admin Area binds its own block.
        $this->assertNull(app(HomeAdminBlock::class)->forCurrentSession());
    }
}
