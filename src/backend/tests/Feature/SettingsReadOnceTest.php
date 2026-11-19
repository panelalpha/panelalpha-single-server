<?php

namespace Tests\Feature;

use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * `Setting::get` reads the settings table once per request or
 * queued job (a scoped container instance) instead of once per key, and a
 * write through the model or `settings:unset` is seen by the next read.
 */
class SettingsReadOnceTest extends TestCase
{
    use RefreshDatabase;

    public function test_many_keys_cost_one_query(): void
    {
        Setting::set('userapp.name', 'Panel');
        Setting::set('system.support-link', 'https://support.example.com');

        $queries = 0;
        DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->assertSame('Panel', Setting::get('userapp.name'));
        $this->assertSame('https://support.example.com', Setting::get('system.support-link'));
        $this->assertNull(Setting::get('userapp.custom-css'));
        $this->assertSame('en', Setting::get('userapp.default-language', 'en'));

        $this->assertSame(1, $queries);
    }

    public function test_a_write_is_seen_by_the_next_read(): void
    {
        Setting::set('userapp.name', 'Old');
        $this->assertSame('Old', Setting::get('userapp.name'));

        Setting::set('userapp.name', 'New');

        $this->assertSame('New', Setting::get('userapp.name'));
    }

    public function test_settings_unset_is_seen_by_the_next_read(): void
    {
        Setting::set('engine-api-ca', 'pinned-pem');
        $this->assertSame('pinned-pem', Setting::get('engine-api-ca'));

        $this->artisan('settings:unset', ['name' => 'engine-api-ca'])->assertSuccessful();

        $this->assertNull(Setting::get('engine-api-ca'));
    }

    public function test_the_map_is_forgotten_between_requests_and_jobs(): void
    {
        Setting::set('userapp.name', 'Old');
        $this->assertSame('Old', Setting::get('userapp.name'));

        // Another process (the entrypoint's `settings:set`) wrote the row.
        Setting::query()->where('name', 'userapp.name')->update(['value' => 'New']);
        $this->assertSame('Old', Setting::get('userapp.name'));

        // What the queue worker does before every job (QueueServiceProvider)
        // and Octane before every request.
        $this->app->forgetScopedInstances();

        $this->assertSame('New', Setting::get('userapp.name'));
    }
}
