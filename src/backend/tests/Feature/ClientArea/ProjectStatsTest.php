<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Models\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Project usage comes from the Engine. The CA `stats` block is
 * built by `ProjectPresenter` from the synced project alone – no page reads
 * `E:/usage` live since Engine 2.2.0 (2026-10-15):
 *
 * - `stats.storage` from the project's `disk` (`total_bytes`, `limit_bytes`;
 *   -1 or null = unlimited);
 * - `stats.bandwidth` from the project's `bandwidth` (this UTC month's
 *   `used_bytes`, 0 for a measurement of an earlier month; `limit_bytes` -1 =
 *   unlimited), `{usage: null, maximum: null}` before the first measurement;
 * - `stats` null when there is neither measurement.
 *
 * Contract:
 * - CA: the project show `packages/client-area/src/apis/Instances.js:17`, the
 *   list `:76`; `instanceResource` reads `stats` at `:146-183` (a falsy `usage`
 *   shows `-`, a `maximum` null or -1 shows `∞`, `stats` null shows `-`).
 * - Engine: the project resource `core/app/Http/Resources/UserResource.php:43`
 *   puts `disk` (`:75-90`, `ProjectDisk::latest()`) and, on 2.2.0, `bandwidth`
 *   (`:96-109`: `month` `Y-m`, `used_bytes`, `limit_bytes` scaled with -1 for
 *   unlimited, `measured_at`; `core/app/Lib/Usage/ProjectBandwidth.php:35`) on
 *   every item of `GET /projects/all` (`core/app/Http/Controllers/UserController.php:122`).
 */
final class ProjectStatsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * One `disk` block of the Engine project resource.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function disk(array $overrides = []): array
    {
        // Engine: core/app/Http/Resources/UserResource.php:75 -> disk(), core/app/Lib/Host/ProjectDisk.php:89 -> latest()
        return array_merge([
            'files_bytes' => 52428800,
            'docker_bytes' => 1048576000,
            'total_bytes' => 1101004800,
            'limit_bytes' => 10737418240,
            'measured_at' => '2026-10-13T08:00:00Z',
        ], $overrides);
    }

    /**
     * One `bandwidth` block of the Engine 2.2.0 project resource, measured this
     * month (the tests travel to 2026-10-15).
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function bandwidth(array $overrides = []): array
    {
        // Engine: core/app/Http/Resources/UserResource.php:96-109 -> bandwidth(), core/app/Lib/Usage/ProjectBandwidth.php:35 (month Y-m)
        return array_merge([
            'month' => '2026-10',
            'used_bytes' => 27106703,
            'limit_bytes' => -1,
            'measured_at' => '2026-10-15T03:00:00+00:00',
        ], $overrides);
    }

    /**
     * Sync the given Engine projects and fake the live usage read, so a page
     * that wrongly read it would succeed and be caught by the not-sent
     * assertions instead of failing as a stray request.
     *
     * @param  list<array<string, mixed>>  $projects
     */
    private function engineWith(array $projects): void
    {
        $this->travelTo('2026-10-15 12:00:00');
        $this->configureEngine();
        Http::fake([
            // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
            'engine.example.com/api/projects/all*' => Http::response(['data' => $projects]),
            // Engine: core/app/Http/Controllers/User/UsageController.php:33 -> getUsage, core/app/Lib/Usage/ProjectUsage.php:44 -> summary
            'engine.example.com/api/projects/*/usage' => Http::response($this->engineUsage()),
        ]);
    }

    private static function isUsageRead(Request $request): bool
    {
        return str_ends_with((string) parse_url($request->url(), PHP_URL_PATH), '/usage');
    }

    public function test_the_list_reads_storage_and_bandwidth_from_the_synced_project(): void
    {
        $this->engineWith([
            $this->engineProject(10, 'site1', ['disk' => $this->disk(), 'bandwidth' => $this->bandwidth()]),
            $this->engineProject(11, 'site2', ['disk' => $this->disk(['total_bytes' => 2048, 'limit_bytes' => 4096]), 'bandwidth' => $this->bandwidth(['used_bytes' => 512, 'limit_bytes' => 1073741824])]),
            $this->engineProject(12, 'site3', ['disk' => $this->disk(['total_bytes' => 4096])]),
            $this->engineProject(13, 'site1-staging', ['staging_of' => 'site1', 'disk' => $this->disk(['total_bytes' => 1024]), 'bandwidth' => $this->bandwidth(['used_bytes' => 7])]),
        ]);
        $user = User::factory()->create();

        // CA: packages/client-area/src/apis/Instances.js:76
        $items = collect($this->actingAs($user)->getJson('/api/projects')->assertOk()->json('data'))->keyBy('domain');

        // CA reads: packages/client-area/src/apis/Instances.js:146-183 (info.visitors/bandwidth/storage)
        $this->assertSame([
            'storage' => ['usage' => 1101004800, 'maximum' => 10737418240],
            'bandwidth' => ['usage' => 27106703, 'maximum' => null],
            'visitors' => [],
        ], $items['site1.example.com']['stats']);
        $this->assertSame(['usage' => 2048, 'maximum' => 4096], $items['site2.example.com']['stats']['storage']);
        $this->assertSame(['usage' => 512, 'maximum' => 1073741824], $items['site2.example.com']['stats']['bandwidth']);
        // Not measured yet: the CA shows `-`.
        $this->assertSame(['usage' => null, 'maximum' => null], $items['site3.example.com']['stats']['bandwidth']);
        // The staging inside its live project's list item reads its own measurements.
        $this->assertSame(['usage' => 1024, 'maximum' => 10737418240], $items['site1.example.com']['staging_apps'][0]['stats']['storage']);
        $this->assertSame(['usage' => 7, 'maximum' => null], $items['site1.example.com']['staging_apps'][0]['stats']['bandwidth']);

        // The only Engine call is the sync.
        Http::assertNotSent(fn (Request $request): bool => self::isUsageRead($request));
        Http::assertSentCount(1);
    }

    public function test_the_page_reads_the_synced_project_and_never_the_live_usage(): void
    {
        $this->engineWith([
            $this->engineProject(10, 'site1', ['disk' => $this->disk(), 'bandwidth' => $this->bandwidth()]),
            $this->engineProject(11, 'site1-staging', ['staging_of' => 'site1', 'disk' => $this->disk(['total_bytes' => 1024])]),
        ]);
        $user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        // CA: packages/client-area/src/apis/Instances.js:17
        $item = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()->json('data');

        // CA reads: packages/client-area/src/apis/Instances.js:146-183 (info.visitors/bandwidth/storage)
        $this->assertSame([
            'storage' => ['usage' => 1101004800, 'maximum' => 10737418240],
            'bandwidth' => ['usage' => 27106703, 'maximum' => null],
            'visitors' => [],
        ], $item['stats']);
        $this->assertSame(['usage' => null, 'maximum' => null], $item['staging_apps'][0]['stats']['bandwidth']);
        Http::assertNotSent(fn (Request $request): bool => self::isUsageRead($request));
    }

    /**
     * The Engine refreshes the measurement daily: one of an earlier month
     * means nothing was transferred this month yet.
     */
    public function test_a_measurement_of_an_earlier_month_is_no_transfer_this_month(): void
    {
        $this->engineWith([$this->engineProject(10, 'site1', ['disk' => $this->disk(), 'bandwidth' => $this->bandwidth(['month' => '2026-09', 'used_bytes' => 999])])]);
        $user = User::factory()->create();

        // CA: packages/client-area/src/apis/Instances.js:76
        $item = $this->actingAs($user)->getJson('/api/projects')->assertOk()->json('data.0');

        // CA reads: packages/client-area/src/apis/Instances.js:161-170 (bandwidth usage)
        $this->assertSame(['usage' => 0, 'maximum' => null], $item['stats']['bandwidth']);
    }

    public function test_the_list_of_more_projects_makes_no_usage_call_either(): void
    {
        $projects = [];
        foreach (range(10, 19) as $id) {
            $projects[] = $this->engineProject($id, "site{$id}", ['disk' => $this->disk(), 'bandwidth' => $this->bandwidth()]);
        }
        $this->engineWith($projects);
        $user = User::factory()->create();
        // Warm the sync TTL, then forget what was recorded so far.
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        Http::fake();

        // CA: packages/client-area/src/apis/Instances.js:76
        $items = $this->actingAs($user)->getJson('/api/projects?per_page=10')->assertOk()->json('data');

        // CA reads: packages/client-area/src/apis/Instances.js:161-183 (info.bandwidth/storage)
        $this->assertCount(10, $items);
        $this->assertSame(1101004800, $items[0]['stats']['storage']['usage']);
        $this->assertSame(27106703, $items[0]['stats']['bandwidth']['usage']);
        Http::assertNothingSent();
    }

    public function test_the_stats_are_null_without_any_measurement(): void
    {
        $this->engineWith([
            $this->engineProject(10, 'site1'),
            $this->engineProject(11, 'site2', ['disk' => null, 'bandwidth' => null]),
            $this->engineProject(12, 'site3', ['bandwidth' => $this->bandwidth()]),
        ]);
        $user = User::factory()->create();

        // CA: packages/client-area/src/apis/Instances.js:76
        $items = collect($this->actingAs($user)->getJson('/api/projects')->assertOk()->json('data'))->keyBy('domain');
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();
        // CA: packages/client-area/src/apis/Instances.js:17
        $page = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()->json('data');

        // CA reads: packages/client-area/src/apis/Instances.js:146-183 (`stats` null shows `-` everywhere)
        $this->assertNull($items['site1.example.com']['stats']);
        $this->assertNull($items['site2.example.com']['stats']);
        $this->assertNull($page['stats']);
        // Bandwidth alone still shows; storage is `-`.
        $this->assertSame([
            'storage' => ['usage' => null, 'maximum' => null],
            'bandwidth' => ['usage' => 27106703, 'maximum' => null],
            'visitors' => [],
        ], $items['site3.example.com']['stats']);
        Http::assertNotSent(fn (Request $request): bool => self::isUsageRead($request));
    }

    /**
     * Engine 2.2.0 answers an unlimited `disk.limit_bytes` and
     * `bandwidth.limit_bytes` as -1 (`null` before it; `-1048576` was the old
     * `/usage` bandwidth); null means never set. The CA shows `∞` only for a
     * null maximum (Instances.js:178-182).
     *
     * @return array<string, array{mixed, int|null}>
     */
    public static function engineLimits(): array
    {
        return [
            'unlimited (-1, Engine 2.2.0)' => [-1, null],
            'unlimited bandwidth before 2.2.0' => [-1048576, null],
            'never set (null)' => [null, null],
            'a real limit' => [4096, 4096],
        ];
    }

    #[DataProvider('engineLimits')]
    public function test_a_negative_engine_limit_is_unlimited_on_the_list_and_the_page(mixed $engine, ?int $expected): void
    {
        $this->engineWith([$this->engineProject(10, 'site1', [
            'disk' => $this->disk(['limit_bytes' => $engine]),
            'bandwidth' => $this->bandwidth(['limit_bytes' => $engine]),
        ])]);
        $user = User::factory()->create();

        // CA: packages/client-area/src/apis/Instances.js:76
        $item = $this->actingAs($user)->getJson('/api/projects')->assertOk()->json('data.0');
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();
        // CA: packages/client-area/src/apis/Instances.js:17
        $page = $this->actingAs($user)->getJson('/api/projects/'.$application->id)->assertOk()->json('data');

        // CA reads: packages/client-area/src/apis/Instances.js:178-182 (a null maximum shows `∞`)
        $this->assertSame($expected, $item['stats']['storage']['maximum']);
        $this->assertSame($expected, $item['stats']['bandwidth']['maximum']);
        $this->assertSame($expected, $page['stats']['storage']['maximum']);
        $this->assertSame($expected, $page['stats']['bandwidth']['maximum']);
    }

    /**
     * The seam and its two implementations are gone; the
     * presenter reads the Engine values itself. On 2026-10-15 the live
     * usage read went too.
     */
    public function test_the_facets_seam_and_the_live_usage_read_are_gone(): void
    {
        $this->assertFalse(interface_exists('PanelAlpha\\ClientArea\\Contracts\\ProjectFacets'));
        $this->assertFalse(class_exists('PanelAlpha\\ClientArea\\Projects\\NullProjectFacets'));
        $this->assertFalse(class_exists('PanelAlpha\\ClientAreaLegacy\\Projects\\PanelProjectFacets'));
        $this->assertFalse(class_exists('PanelAlpha\\ClientArea\\Projects\\ProjectUsageService'));

        $parameters = (new \ReflectionMethod(ProjectPresenter::class, '__construct'))->getParameters();
        // The installation state is `DeployState`'s (the Engine's),
        // no longer the deploy tracker's. The service fields come from the
        // ServiceDirectory; diagnostic mode
        // from the DiagnosticMode seam (§5.9, never in Community); a WordPress
        // import's `import_details` from ImportDetailsPresenter; `owned`,
        // `owner` and `shared_access` from the ProjectSharing contract;
        // the service's DNS and e-mail flags from ServiceDnsEmail; the
        // events announce a list so the paid answers batch their lookups;
        // the domain dialogs' DNS settings from ServiceOnboarding; the `resources`
        // block's plan ceilings from the ProjectLimits contract (project-usage, phase 1);
        // the server's IPv4 list for a project without its own from ServerIpv4Addresses.
        $this->assertSame(['access', 'deploys', 'services', 'diagnosticMode', 'imports', 'sharing', 'dnsEmail', 'events', 'onboarding', 'limits', 'serverIps'], array_map(static fn (\ReflectionParameter $p): string => $p->getName(), $parameters));
    }

    /**
     * Moved unchanged from `Tests\Feature\ClientAreaLegacy\ProjectFacetsTest`
     * (that class was deleted with the seam it tested).
     */
    public function test_preload_keeps_the_project_list_query_count_flat(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        $application->applicationLabels()->create(['title' => 'Prod', 'color' => '#ff0000']);

        // Warm the sync TTL so the measured requests do not sync the mirror.
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();

        // CA: packages/client-area/src/apis/Instances.js:76
        $one = $this->queryCount(fn () => $this->actingAs($user)->getJson('/api/projects')->assertOk());

        $second = Application::query()->create([
            'engine_id' => $application->engine_id,
            'engine_username' => 'site2',
            'domain' => 'site2.example.com',
            'status' => 'active',
        ]);
        $second->applicationLabels()->create(['title' => 'Prod', 'color' => '#ff0000']);

        // CA: packages/client-area/src/apis/Instances.js:76
        $two = $this->queryCount(fn () => $this->actingAs($user)->getJson('/api/projects')->assertOk());

        $this->assertSame($one, $two, 'ProjectPresenter must eager-load applicationLabels.');
    }

    private function queryCount(callable $callback): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();

        $callback();

        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }
}
