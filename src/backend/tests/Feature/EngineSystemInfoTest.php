<?php

namespace Tests\Feature;

use App\Support\EngineSystemInfo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * `/home` reads only the
 * cache; the scheduler refreshes it when the value is older than 300 s, and a
 * failed refresh keeps the last good value for an outage of any length.
 *
 * @see Engine core/routes/api.php:431 (GET /system/info) – the package SystemApi
 */
class EngineSystemInfoTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_get_never_calls_the_engine_on_a_cache_miss(): void
    {
        $this->configureEngine();
        Http::preventStrayRequests();

        // Miss -> empty data, no Engine call.
        $this->assertSame([], app(EngineSystemInfo::class)->get());
        Http::assertNothingSent();
    }

    public function test_refresh_populates_the_cache(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/SystemController.php:41
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => [
            'sites_base_domain' => 'panelalpha.online',
        ]])]);

        app(EngineSystemInfo::class)->refresh();

        $this->assertSame('panelalpha.online', app(EngineSystemInfo::class)->get()['sites_base_domain']);
    }

    public function test_refresh_keeps_the_last_good_value_on_failure(): void
    {
        $this->configureEngine();

        // The first refresh succeeds, every later one fails; one stub drives both
        // calls so the second really fails.
        $calls = 0;
        Http::fake([
            'engine.example.com/api/system/info' => function () use (&$calls) {
                if (++$calls > 1) {
                    throw new ConnectionException('down');
                }

// Engine: core/app/Http/Controllers/SystemController.php:41
                return Http::response(['data' => ['sites_base_domain' => 'panelalpha.online']]);
            },
        ]);

        Carbon::setTestNow('2026-10-10 10:00:00');
        app(EngineSystemInfo::class)->refresh();

        // Stale enough to fetch again; this call is the one that fails.
        Carbon::setTestNow('2026-10-10 10:06:00');
        app(EngineSystemInfo::class)->refresh();

        // A failed refresh must not wipe the last good payload.
        $this->assertSame('panelalpha.online', app(EngineSystemInfo::class)->get()['sites_base_domain']);
        // The failing call throws before it is recorded, so count the stub calls.
        $this->assertSame(2, $calls);

        Carbon::setTestNow();
    }

    public function test_the_last_good_value_survives_an_outage_longer_than_five_minutes(): void
    {
        $this->configureEngine();

        $calls = 0;
        Http::fake([
            'engine.example.com/api/system/info' => function () use (&$calls) {
                if (++$calls > 1) {
                    throw new ConnectionException('down');
                }

// Engine: core/app/Http/Controllers/SystemController.php:41
                return Http::response(['data' => ['sites_base_domain' => 'panelalpha.online']]);
            },
        ]);

        Carbon::setTestNow('2026-10-10 10:00:00');
        app(EngineSystemInfo::class)->refresh();
        $this->assertSame('panelalpha.online', app(EngineSystemInfo::class)->get()['sites_base_domain']);

        // Ten minutes and a down Engine later the value is still served.
        Carbon::setTestNow('2026-10-10 10:10:00');
        app(EngineSystemInfo::class)->refresh();
        $this->assertSame('panelalpha.online', app(EngineSystemInfo::class)->get()['sites_base_domain']);

        Carbon::setTestNow();
    }

    public function test_a_refresh_inside_the_window_is_skipped_and_a_stale_one_is_fetched(): void
    {
        $this->configureEngine();
// Engine: core/app/Http/Controllers/SystemController.php:41
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => [
            'sites_base_domain' => 'panelalpha.online',
        ]])]);

        Carbon::setTestNow('2026-10-10 10:00:00');
        app(EngineSystemInfo::class)->refresh();

        // Inside 300 s the minute-scheduler call makes no Engine call.
        Carbon::setTestNow('2026-10-10 10:01:00');
        app(EngineSystemInfo::class)->refresh();
        Http::assertSentCount(1);

        // After the window it refreshes again.
        Carbon::setTestNow('2026-10-10 10:06:00');
        app(EngineSystemInfo::class)->refresh();
        Http::assertSentCount(2);

        Carbon::setTestNow();
    }
}
