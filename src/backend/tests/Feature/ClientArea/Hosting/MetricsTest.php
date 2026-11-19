<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The SSL provider list and the whole-Engine metrics.
 * @see packages/client-area/src/views/hosting/UsageCard.vue:182, GraphsCard.vue:213 – the CA call sites
 * @see Engine core/routes/api.php:462-466 (metrics/*), 401-405 (proxy-rules)
 */
class MetricsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->configureEngine();
    }

    public function test_ssl_offer_lists_lets_encrypt(): void
    {
        $this->actingAs(User::factory()->create())
// CA: packages/client-area/src/components/security/SslEditModal.vue:309
            ->getJson('/api/ssl-offer')
            ->assertOk()
// CA reads: packages/client-area/src/components/security/SslEditModal.vue:215
            ->assertJsonPath('data.0.id', 1)
// CA reads: packages/client-area/src/components/security/SslEditModal.vue:214
            ->assertJsonPath('data.0.name', "Let's Encrypt");
    }

    public function test_current_metrics_proxy_the_engine(): void
    {
        // Engine: core/app/Http/Controllers/ServerMetricsController.php:35 -> current()
        Http::fake(['engine.example.com/api/metrics/current' => Http::response(['data' => [
            'cpu_usage_percent' => 12.5,
            'ram_usage_percent' => 40.0,
            'ram_used' => 4194304,
            'ram_total' => 8388608,
            'disk_usage_percent' => 55.0,
            'disk_used' => 10737418240,
            'disk_total' => 21474836480,
        ]])]);

        $this->actingAs(User::factory()->create())
// CA: packages/client-area/src/views/hosting/UsageCard.vue:182
            ->getJson('/api/server/metrics/current')
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/UsageCard.vue:126
            ->assertJsonPath('data.cpu_usage_percent', 12.5)
// CA reads: packages/client-area/src/views/hosting/UsageCard.vue:132
            ->assertJsonPath('data.ram_usage_percent', 40)
// CA reads: packages/client-area/src/views/hosting/UsageCard.vue:139
            ->assertJsonPath('data.ram_used', 4194304)
// CA reads: packages/client-area/src/views/hosting/UsageCard.vue:147
            ->assertJsonPath('data.ram_total', 8388608)
// CA reads: packages/client-area/src/views/hosting/UsageCard.vue:154
            ->assertJsonPath('data.disk_usage_percent', 55)
// CA reads: packages/client-area/src/views/hosting/UsageCard.vue:161
            ->assertJsonPath('data.disk_used', 10737418240)
// CA reads: packages/client-area/src/views/hosting/UsageCard.vue:169
            ->assertJsonPath('data.disk_total', 21474836480);
    }

    public function test_period_metrics_map_to_the_engine_paths(): void
    {
        // Engine: core/app/Http/Controllers/ServerMetricsController.php:137 -> last5Minutes();
        // the bucket-list envelope is built at :196-222.
        Http::fake(['engine.example.com/api/metrics/last-5-minutes' => Http::response(['data' => [
            ['period' => '2026-10-11 10:00:00', 'cpu_percent' => 12.5, 'ram_percent' => 40.0, 'disk_read_bps' => 1024],
        ]])]);

        $this->actingAs(User::factory()->create())
// CA: packages/client-area/src/views/hosting/GraphsCard.vue:213
            ->getJson('/api/server/metrics/last-5-minutes')
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/CpuPercentGraph.vue:57
            ->assertJsonPath('data.0.period', '2026-10-11 10:00:00')
// CA reads: packages/client-area/src/views/hosting/CpuPercentGraph.vue:58
            ->assertJsonPath('data.0.cpu_percent', 12.5)
// CA reads: packages/client-area/src/views/hosting/DiskThroughputGraph.vue:68
            ->assertJsonPath('data.0.disk_read_bps', 1024);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/metrics/last-5-minutes'));
    }

    public function test_an_unknown_period_is_404(): void
    {
        $this->actingAs(User::factory()->create())
// CA: packages/client-area/src/views/hosting/GraphsCard.vue:213
            ->getJson('/api/server/metrics/forever')
            ->assertNotFound();
    }

    public function test_metrics_require_authentication(): void
    {
// CA: packages/client-area/src/views/hosting/UsageCard.vue:182
        $this->getJson('/api/server/metrics/current')->assertUnauthorized();
// CA: packages/client-area/src/components/security/SslEditModal.vue:309
        $this->getJson('/api/ssl-offer')->assertUnauthorized();
    }
}
