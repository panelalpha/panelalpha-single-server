<?php

namespace Tests\Feature;

use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * @see Host CLI (settings table, Engine credentials)
 */
class SettingsCommandsTest extends TestCase
{
    use RefreshDatabase;

    public function test_settings_set_and_get(): void
    {
        $this->artisan('settings:set', [
            'name' => 'engine-api-url',
            'value' => 'https://engine.example.com/api',
        ])->assertSuccessful();

        $this->assertSame(
            'https://engine.example.com/api',
            Setting::get('engine-api-url'),
        );

        $this->artisan('settings:get', ['name' => 'engine-api-url'])
            ->assertSuccessful()
            ->expectsOutput('https://engine.example.com/api');

        $this->artisan('settings:get')
            ->assertSuccessful()
            ->expectsOutputToContain('engine-api-url');
    }

    public function test_settings_get_missing_returns_failure(): void
    {
        $this->artisan('settings:get', ['name' => 'missing'])
            ->assertFailed();
    }

    public function test_settings_unset_removes_the_row(): void
    {
        // The entrypoint clears an env-written `engine-api-ca`
        // pin with `settings:unset`; `settings:set` cannot store an empty value.
        Setting::set('engine-api-ca', 'pinned-pem');
        Setting::set('engine-api-url', 'https://engine.example.com/api');

        $this->artisan('settings:unset', ['name' => 'engine-api-ca'])
            ->assertSuccessful();

        $this->assertNull(Setting::get('engine-api-ca'));
        $this->assertSame('https://engine.example.com/api', Setting::get('engine-api-url'));
    }

    public function test_settings_unset_missing_returns_failure(): void
    {
        $this->artisan('settings:unset', ['name' => 'missing'])
            ->assertFailed()
            ->expectsOutput('Setting not found: missing');
    }
}
