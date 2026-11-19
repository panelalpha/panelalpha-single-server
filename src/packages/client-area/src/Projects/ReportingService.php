<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Support\Carbon;
use PanelAlpha\EngineClient\Api\UsageApi;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\SessionLength;

/**
 * Bandwidth and visitor reporting for one project,
 * backed by the Engine AWStats endpoints. The CA sends a `{period}`; the panel
 * turns it into a date range and (for bandwidth) fills the missing intervals
 * so the chart has one point per day/month, like the old ReportingController.
 */
final class ReportingService
{
    /**
     * @return array{records: array<string, int|null>, total: int}
     */
    public function bandwidth(Application $application, string $period): array
    {
        [$start, $end] = $this->periodToRange($period);
        $groupBy = $period === 'last-year' ? 'month' : 'day';

        $raw = (new UsageApi($application->engine()))->bandwidth($application->engineProject(), $start, $end, $groupBy);
        if (is_array($raw['data'] ?? null)) {
            $raw = Payload::object($raw['data']);
        }

        // The Engine keys a month series by the first of the month (`Y-m-01`,
        // Engine UsageController docblock); the CA reads `Y-m`.
        $format = $period === 'last-year' ? 'Y-m' : 'Y-m-d';
        $byKey = [];
        foreach (array_keys($raw) as $key) {
            if (is_string($key)) {
                $byKey[Carbon::parse($key)->format($format)] = Payload::int($raw[$key]);
            }
        }

        $records = [];
        $total = 0;
        foreach ($this->intervals($start, $end, $period) as $key) {
            $value = $byKey[$key] ?? null;
            $records[$key] = $value;
            $total += $value ?? 0;
        }

        return ['records' => $records, 'total' => $total];
    }

    /**
     * The old `AWStats::getVisitors` shape, from a current and a previous range.
     *
     * @return array{visits: array{records: array<string, mixed>, total: int, previous_total: int}, visits_length: array{records: array<string, int>, total: int, previous_total: int}}
     */
    public function visitors(Application $application, string $period): array
    {
        [$start, $end] = $this->periodToRange($period);
        [$prevStart, $prevEnd] = $this->previousRange($start, $end);

        $api = new UsageApi($application->engine());
        $domain = (string) $application->domain;
        $current = $api->visitors($application->engineProject(), $domain, $start, $end);
        $previous = $api->visitors($application->engineProject(), $domain, $prevStart, $prevEnd);

        $currentVisits = Payload::object($current['visits'] ?? null);
        $previousVisits = Payload::object($previous['visits'] ?? null);

        $currentRecords = Payload::object($currentVisits['records'] ?? null);
        if ($period === 'last-year') {
            // The Engine returns daily records; the old panel aggregated them by
            // month and zero-filled the months without data for last-year
            // (AWStats::getVisitorsFromRange).
            $currentRecords = $this->monthlyRecords($currentRecords, $start, $end);
        } else {
            // The Engine omits days with no traffic; zero-fill the range so the
            // CA's visits chart shows a flat line instead of an empty chart, as
            // bandwidth already does.
            $currentRecords = $this->dailyRecords($currentRecords, $start, $end);
        }

        // The session-time chart reads seconds per chart interval: the
        // Engine's `session_length` (Engine 2.2.0), not the AWStats
        // SESSION buckets of `visits_length`.
        $format = $period === 'last-year' ? 'Y-m' : 'Y-m-d';
        $lengthRecords = SessionLength::records($current['session_length'] ?? null, $this->intervals($start, $end, $period), $format);

        return [
            'visits' => [
                'records' => $currentRecords,
                'total' => Payload::int($currentVisits['total'] ?? null) ?? (int) array_sum($currentRecords),
                'previous_total' => Payload::int($previousVisits['total'] ?? null) ?? 0,
            ],
            'visits_length' => [
                'records' => $lengthRecords,
                'total' => SessionLength::average($current['session_length'] ?? null),
                'previous_total' => SessionLength::average($previous['session_length'] ?? null),
            ],
        ];
    }

    /**
     * @return array<string, mixed>|list<mixed>
     */
    public function breakdown(Application $application, string $type, string $period): array
    {
        $dimension = UsageApi::DIMENSIONS[$type] ?? null;
        if ($dimension === null) {
            // Dimensions AWStats cannot answer (device, device brand) come back
            // empty – the CA shows "no data".
            return [];
        }

        [$start, $end] = $this->periodToRange($period);
        $raw = (new UsageApi($application->engine()))->visitorBreakdown(
            $application->engineProject(),
            (string) $application->domain,
            $dimension,
            $start,
            $end,
        );

        if (is_array($raw['data'] ?? null)) {
            return Payload::object($raw['data']);
        }

        return $raw;
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function periodToRange(string $period): array
    {
        $yesterday = Carbon::now()->subDay();

        return match ($period) {
            'last-month' => [$yesterday->copy()->subDays(29)->format('Y-m-d'), $yesterday->format('Y-m-d')],
            'last-year' => [$yesterday->copy()->subMonths(11)->format('Y-m-01'), $yesterday->format('Y-m-d')],
            default => [$yesterday->copy()->subDays(6)->format('Y-m-d'), $yesterday->format('Y-m-d')],
        };
    }

    /**
     * Aggregate Engine daily visit records into the CA's `Y-m` buckets and
     * zero-fill every month of the range (old panel's month period).
     *
     * @param  array<string, mixed>  $records
     * @return array<string, int>
     */
    private function monthlyRecords(array $records, string $start, string $end): array
    {
        $sums = [];
        foreach (array_keys($records) as $date) {
            $key = Carbon::parse($date)->format('Y-m');
            $sums[$key] = ($sums[$key] ?? 0) + (Payload::int($records[$date]) ?? 0);
        }

        $monthly = [];
        foreach ($this->intervals($start, $end, 'last-year') as $key) {
            $monthly[$key] = $sums[$key] ?? 0;
        }

        return $monthly;
    }

    /**
     * Zero-fill the Engine's daily visit records over the range: the Engine
     * omits days with no traffic, which left the CA's visits chart empty
     * instead of flat.
     *
     * @param  array<string, mixed>  $records
     * @return array<string, int>
     */
    private function dailyRecords(array $records, string $start, string $end): array
    {
        $byKey = [];
        foreach (array_keys($records) as $date) {
            if (is_string($date)) {
                $byKey[Carbon::parse($date)->format('Y-m-d')] = Payload::int($records[$date]) ?? 0;
            }
        }

        $daily = [];
        foreach ($this->intervals($start, $end, 'last-week') as $key) {
            $daily[$key] = $byKey[$key] ?? 0;
        }

        return $daily;
    }

    /**
     * The same-length range immediately before `$start`..`$end`.
     *
     * @return array{0: string, 1: string}
     */
    private function previousRange(string $start, string $end): array
    {
        $startDate = Carbon::parse($start);
        $days = (int) $startDate->diffInDays(Carbon::parse($end)) + 1;

        return [
            $startDate->copy()->subDays($days)->format('Y-m-d'),
            $startDate->copy()->subDay()->format('Y-m-d'),
        ];
    }

    /**
     * @return list<string>
     */
    private function intervals(string $start, string $end, string $period): array
    {
        $format = $period === 'last-year' ? 'Y-m' : 'Y-m-d';
        $cursor = Carbon::parse($start);
        $last = Carbon::parse($end);

        $keys = [];
        while ($cursor->lte($last)) {
            $keys[$cursor->format($format)] = true;
            $period === 'last-year' ? $cursor->addMonth() : $cursor->addDay();
        }

        return array_keys($keys);
    }
}
