<?php

namespace Tests\Feature\ClientArea\Reporting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Bandwidth and visitor reporting.
 * @see packages/client-area/src/views/instance/General.vue:310 (reporting)
 * @see Engine core/routes/api.php:157-161 (usage/bandwidth/visitors)
 */
class ReportingTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user): Application
    {
        return $this->syncedApplication($user);
    }

    public function test_bandwidth_fills_the_last_week_and_sums(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $today = now()->subDay()->format('Y-m-d');

        // Engine: core/app/Http/Controllers/User/UsageController.php:66 -> UsageController::getBandwidth
        // The Engine returns a bare object keyed by date, not a `{data: …}` envelope.
        Http::fake(['engine.example.com/api/projects/site1/bandwidth*' => Http::response([
            $today => 1024,
        ])]);

        // CA: src/views/instance/General.vue:309
        // CA reads: src/views/instance/General.vue:310-320
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/reporting/bandwidth/last-week")
            ->assertOk()
            ->json('data');

        $this->assertCount(7, $response['records']);
        $this->assertSame(1024, $response['total']);
        $this->assertSame(1024, $response['records'][$today]);
    }

    public function test_year_bandwidth_maps_the_engine_month_key(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine keys a month series by the first of the month (UsageController
        // docblock); the CA reads `Y-m`.
        $engineKey = now()->subMonths(3)->format('Y-m-01');
        $caKey = now()->subMonths(3)->format('Y-m');

        // Engine: core/app/Http/Controllers/User/UsageController.php:66 -> UsageController::getBandwidth
        Http::fake(['engine.example.com/api/projects/site1/bandwidth*' => Http::response([$engineKey => 2048])]);

        // CA: src/views/instance/General.vue:309
        // CA reads: src/views/instance/General.vue:310-320
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/reporting/bandwidth/last-year")
            ->assertOk()
            ->json('data');

        $this->assertSame(2048, $response['records'][$caKey]);
        $this->assertSame(2048, $response['total']);
        Http::assertSent(fn ($r) => $r['group_by'] === 'month');
    }

    public function test_visitors_builds_the_old_shape_from_two_ranges(): void
    {
        // The fake's records sit in last week as of this date.
        $this->travelTo('2026-10-15 12:00:00');
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/UsageController.php:142 -> UsageController::getDomainVisitors
        Http::fake([
            'engine.example.com/api/projects/site1/domains/*/visitors*' => Http::sequence()
                ->push([
                    'unique' => 3,
                    'total' => 3,
                    'visits' => ['records' => ['2026-10-09' => 3], 'total' => 3],
                    'visits_length' => ['1-30 s' => 2],
                    'session_length' => ['records' => ['2026-10-09' => 15], 'average' => 15, 'estimated' => true],
                ])
                ->push([
                    'unique' => 2,
                    'total' => 2,
                    'visits' => ['records' => ['2026-10-02' => 2], 'total' => 2],
                    'visits_length' => ['1-30 s' => 1],
                    'session_length' => ['records' => ['2026-10-02' => 90], 'average' => 90, 'estimated' => true],
                ]),
        ]);

        // CA: src/views/instance/General.vue:226
        // CA reads: src/views/instance/General.vue:227-245
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/reporting/visitors/last-week")
            ->assertOk()
            ->assertJsonPath('data.visits.records.2026-10-09', 3)
            ->assertJsonPath('data.visits.total', 3)
            ->assertJsonPath('data.visits.previous_total', 2)
            // The range averages in seconds, not the bucket counts.
            ->assertJsonPath('data.visits_length.total', 15)
            ->assertJsonPath('data.visits_length.previous_total', 90);

        // One call for the current range and one for the previous one.
        Http::assertSent(fn ($r) => str_contains($r->url(), '/visitors'), 2);
    }

    /**
     * Since Engine 2.2.0, the session-time chart reads seconds per day keyed by
     * date, `total` and `previous_total` as the range averages
     * (`General.vue:264-293` → `secondsToHms(visits_length.total)`). The Engine
     * answers `session_length {records, average, estimated}` with every day of
     * the range, null for a day without sessions.
     */
    public function test_the_session_time_is_the_engine_session_length_per_day(): void
    {
        $this->travelTo('2026-10-15 12:00:00');
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Integrations/Statistics/Awstats.php:115-134 -> sessionLength (every day of the range, null without sessions)
            'engine.example.com/api/projects/site1/domains/*/visitors*' => Http::sequence()
                // Engine: core/app/Integrations/Statistics/Awstats.php:94-105 -> domainVisitors, session_length :115-134
                ->push([
                    'unique' => 3, 'total' => 3,
                    'visits' => ['records' => ['2026-10-09' => 3], 'total' => 3],
                    'visits_length' => ['0s-30s' => 2, '30s-2mn' => 1],
                    'session_length' => ['records' => [
                        '2026-10-08' => null, '2026-10-09' => 74, '2026-10-10' => null, '2026-10-11' => 15,
                        '2026-10-12' => null, '2026-10-13' => null, '2026-10-14' => 120,
                    ], 'average' => 61, 'estimated' => true],
                ])
                // Engine: core/app/Integrations/Statistics/Awstats.php:94-105 -> domainVisitors, session_length :115-134
                ->push([
                    'unique' => 1, 'total' => 1,
                    'visits' => ['records' => ['2026-10-02' => 1], 'total' => 1],
                    'visits_length' => ['0s-30s' => 1],
                    'session_length' => ['records' => ['2026-10-02' => 40], 'average' => 40, 'estimated' => true],
                ]),
        ]);

        // CA: packages/client-area/src/views/instance/General.vue:226
        $length = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/reporting/visitors/last-week")
            ->assertOk()
            ->json('data.visits_length');

        // CA reads: packages/client-area/src/views/instance/General.vue:264-293 (records by date, total/previous_total as seconds)
        $this->assertSame([
            'records' => [
                '2026-10-08' => 0, '2026-10-09' => 74, '2026-10-10' => 0, '2026-10-11' => 15,
                '2026-10-12' => 0, '2026-10-13' => 0, '2026-10-14' => 120,
            ],
            'total' => 61,
            'previous_total' => 40,
        ], $length);
    }

    /**
     * `last-year` charts months, so each month is the average of its days
     * that had sessions (a null day does not lower it); a month without any is 0.
     */
    public function test_last_year_session_time_averages_each_month_skipping_days_without_sessions(): void
    {
        $this->travelTo('2026-10-15 12:00:00');
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Integrations/Statistics/Awstats.php:115-134 -> sessionLength (every day of the range, null without sessions)
            'engine.example.com/api/projects/site1/domains/*/visitors*' => Http::sequence()
                // Engine: core/app/Integrations/Statistics/Awstats.php:94-105 -> domainVisitors, session_length :115-134
                ->push([
                    'unique' => 3, 'total' => 3,
                    'visits' => ['records' => [], 'total' => 0],
                    'visits_length' => [],
                    'session_length' => ['records' => [
                        '2026-03-01' => 60, '2026-03-02' => null, '2026-03-03' => 30,
                        '2026-09-30' => 101,
                    ], 'average' => 64, 'estimated' => true],
                ])
                // Engine: core/app/Integrations/Statistics/Awstats.php:94-105 -> domainVisitors, session_length :115-134
                ->push(['unique' => 0, 'total' => 0, 'visits' => ['records' => [], 'total' => 0], 'visits_length' => [],
                    'session_length' => ['records' => [], 'average' => null, 'estimated' => true]]),
        ]);

        // CA: packages/client-area/src/views/instance/General.vue:226
        $length = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/reporting/visitors/last-year")
            ->assertOk()
            ->json('data.visits_length');

        // CA reads: packages/client-area/src/views/instance/General.vue:264-293 (records by month, total/previous_total as seconds)
        $this->assertCount(12, $length['records']);
        $this->assertSame('2025-11', array_key_first($length['records']));
        $this->assertSame(45, $length['records']['2026-03']);
        $this->assertSame(101, $length['records']['2026-09']);
        $this->assertSame(0, $length['records']['2026-04']);
        $this->assertSame(64, $length['total']);
        // A previous range without sessions averages null: 0.
        $this->assertSame(0, $length['previous_total']);
    }

    public function test_last_week_visitors_zero_fill_every_day_of_the_range(): void
    {
        // The range is the 7 days before "now"; pin it like the siblings so
        // 2026-10-08 and 2026-10-09 stay inside it.
        $this->travelTo('2026-10-15 12:00:00');
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/UsageController.php:142 -> UsageController::getDomainVisitors
        Http::fake([
            'engine.example.com/api/projects/site1/domains/*/visitors*' => Http::sequence()
                ->push([
                    'unique' => 3,
                    'total' => 3,
                    'visits' => ['records' => ['2026-10-09' => 3], 'total' => 3],
                    'visits_length' => [],
                ])
                ->push(['unique' => 0, 'total' => 0, 'visits' => ['records' => [], 'total' => 0], 'visits_length' => []]),
        ]);

        // CA: src/views/instance/General.vue:226
        // CA reads: src/views/instance/General.vue:227-245 (`data.visits.records`)
        $records = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/reporting/visitors/last-week")
            ->assertOk()
            ->json('data.visits.records');

        // The Engine omits days with no traffic; the CA needs one point
        // per day (bandwidth already zero-fills).
        $this->assertCount(7, $records);
        $this->assertSame(3, $records['2026-10-09']);
        $this->assertSame(0, $records['2026-10-08']);
    }

    public function test_last_year_visitors_are_aggregated_by_month_and_zero_filled(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The Engine returns daily records (`Awstats::domainVisitors`); the old
        // panel aggregated them per month for last-year and zero-filled the
        // months it had no data for (`AWStats::getVisitorsFromRange`). Window as
        // `ReportingService::periodToRange('last-year')` builds it.
        $windowStart = now()->subDay()->subMonths(11)->startOfMonth();
        $firstMonth = $windowStart->copy()->addMonths(2);
        $secondMonth = $windowStart->copy()->addMonths(5);

        // Engine: core/app/Http/Controllers/User/UsageController.php:142 -> UsageController::getDomainVisitors
        Http::fake([
            'engine.example.com/api/projects/site1/domains/*/visitors*' => Http::sequence()
                ->push([
                    'unique' => 10,
                    'total' => 10,
                    'visits' => ['records' => [
                        $firstMonth->copy()->addDays(4)->format('Y-m-d') => 4,
                        $firstMonth->copy()->addDays(14)->format('Y-m-d') => 6,
                        $secondMonth->copy()->addDays(2)->format('Y-m-d') => 7,
                    ], 'total' => 17],
                    'visits_length' => ['1-30 s' => 2],
                ])
                ->push([
                    'unique' => 5,
                    'total' => 5,
                    'visits' => ['records' => [], 'total' => 5],
                    'visits_length' => [],
                ]),
        ]);

        // CA: src/views/instance/General.vue:226
        // CA reads: src/views/instance/General.vue:227-245
        $records = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/reporting/visitors/last-year")
            ->assertOk()
            ->json('data.visits.records');

        $this->assertSame(10, $records[$firstMonth->format('Y-m')]);
        $this->assertSame(7, $records[$secondMonth->format('Y-m')]);
        // Twelve months, months without data are 0 (old zero-fill).
        $this->assertCount(12, $records);
        $this->assertContains(0, array_values($records));
        $this->assertSame(
            $windowStart->format('Y-m'),
            array_key_first($records),
        );
    }

    public function test_breakdown_maps_the_ca_type_to_an_engine_dimension(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/UsageController.php:188 -> UsageController::getDomainVisitorBreakdown
        // The Engine returns a bare list, not a `{data: …}` envelope.
        Http::fake(['engine.example.com/api/projects/site1/domains/*/visitors/countries*' => Http::response([
            ['label' => 'Poland', 'visits' => 10],
        ])]);

        // CA: src/views/instance/Monitoring.vue:278
        // CA reads: src/views/instance/Monitoring.vue:279-290
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/reporting/visits-by-country/last-week")
            ->assertOk()
            ->assertJsonPath('data.0.label', 'Poland');

        Http::assertSent(fn ($r) => str_contains($r->url(), '/visitors/countries'));
    }

    public function test_device_dimensions_are_empty(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: src/views/instance/Monitoring.vue:368
        // CA reads: src/views/instance/Monitoring.vue:369-380
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/reporting/visits-by-device/last-week")
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_an_unknown_period_is_404(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: src/views/instance/General.vue:309
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/reporting/bandwidth/forever")
            ->assertNotFound();
    }

    public function test_reporting_requires_authentication(): void
    {
        // CA: src/views/instance/General.vue:309
        $this->getJson('/api/projects/1/reporting/bandwidth/last-week')->assertUnauthorized();
    }
}
