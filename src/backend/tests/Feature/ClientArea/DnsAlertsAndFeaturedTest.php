<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use Tests\TestCase;

/**
 * Two rows the gap audit settled (2026-10-14; re-marked 2026-10-15):
 *
 * - No Engine call needed: `PUT /projects/{id}/dns/alerts/enable|disable` (old
 *   DnsController::enableAlerts/disableAlerts,
 *   packages/api/app/Http/Controllers/User/Instance/DnsController.php:29-61, no
 *   privilege, activity `user.instance.dns.enable_alerts|disable_alerts`) store
 *   the DNS badge's dismiss flag and answer `{data: bool}`; the project presents
 *   it as `details.dns_alerts_enabled`, default true (old Application.php:751).
 *   CA: `DnsSslIndicator.vue:377-381` (PUT, reads `response.data.data`),
 *   `Instances.js:441` / `DnsSslIndicator.vue:295` (reads the detail).
 * - No Engine call needed: `GET /projects/{id}/wordpress/{plugins,themes}/new/featured`
 *   (old `showFromPackagesList`, no privilege) answer `{data: []}` – the admin
 *   packages they listed do not exist in Community. CA: `router/fetchData.js:170,211`
 *   (reads `response.data.data`).
 */
final class DnsAlertsAndFeaturedTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_the_dns_alerts_flag_is_stored_and_presented(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        Http::fake();

        // CA: packages/client-area/src/apis/Instances.js:17
        $default = $this->actingAs($user)->getJson("/api/projects/{$application->id}")->assertOk();
        // CA reads: packages/client-area/src/apis/Instances.js:441 (details.dns_alerts_enabled)
        $default->assertJsonPath('data.details.dns_alerts_enabled', true);

        // CA: packages/client-area/src/components/security/DnsSslIndicator.vue:377-379
        $off = $this->actingAs($user)->putJson("/api/projects/{$application->id}/dns/alerts/disable")->assertOk();
        // CA reads: packages/client-area/src/components/security/DnsSslIndicator.vue:381 (response.data.data)
        $off->assertExactJson(['data' => false]);
        $this->assertFalse(Application::query()->findOrFail($application->id)->dns_alerts_enabled);
        // CA: packages/client-area/src/apis/Instances.js:17
        $shown = $this->actingAs($user)->getJson("/api/projects/{$application->id}")->assertOk();
        // CA reads: packages/client-area/src/components/security/DnsSslIndicator.vue:295 (details.dns_alerts_enabled)
        $shown->assertJsonPath('data.details.dns_alerts_enabled', false);

        // CA: packages/client-area/src/components/security/DnsSslIndicator.vue:377-379
        $on = $this->actingAs($user)->putJson("/api/projects/{$application->id}/dns/alerts/enable")->assertOk();
        // CA reads: packages/client-area/src/components/security/DnsSslIndicator.vue:381 (response.data.data)
        $on->assertExactJson(['data' => true]);

        $this->assertSame(
            ['user.instance.dns.disable_alerts', 'user.instance.dns.enable_alerts'],
            DB::table('activity_logs')->orderBy('id')->pluck('action')->all(),
        );
        Http::assertNothingSent();
    }

    public function test_the_dns_alerts_routes_need_a_visible_project_and_a_session(): void
    {
        // CA: packages/client-area/src/components/security/DnsSslIndicator.vue:377-379
        $this->putJson('/api/projects/1/dns/alerts/disable')->assertUnauthorized();
        $user = User::factory()->create();
        $this->syncedApplication($user);
        // CA: packages/client-area/src/components/security/DnsSslIndicator.vue:377-379
        $this->actingAs($user)->putJson('/api/projects/999/dns/alerts/disable')->assertNotFound();
    }

    public function test_the_featured_lists_are_empty(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();
        Http::fake();

        foreach (['plugins', 'themes'] as $kind) {
            // CA: packages/client-area/src/router/fetchData.js:170 (plugins), :211 (themes)
            $response = $this->actingAs($user)->getJson("/api/projects/{$application->id}/wordpress/{$kind}/new/featured")->assertOk();
            // CA reads: packages/client-area/src/router/fetchData.js:171 (response.data.data)
            $response->assertExactJson(['data' => []]);
        }
        Http::assertNothingSent();
    }
}
