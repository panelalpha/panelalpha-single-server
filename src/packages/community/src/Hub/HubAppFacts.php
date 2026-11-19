<?php

namespace PanelAlpha\Community\Hub;

use Illuminate\Support\Carbon;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\Support\Payload;
use Throwable;

/**
 * What the report says of one app beyond its name (contract §6, `apps.*`):
 * the panel's own facts (domain, creation time) and what the Engine answered
 * for it just now in `projects/all`, mapped as the Hub maps a connected
 * Engine's app (`EngineApi::mapApp`). Without an Engine answer only the
 * panel's facts are sent: a stale mirror must not show stale usage or health.
 */
final class HubAppFacts
{
    /**
     * @param  array<string, mixed>|null  $project  the app in `projects/all`, null when the Engine did not answer
     * @param  list<array<string, mixed>>|null  $containers  the app's `containers/metrics`, null when not read
     * @return array{domain: string|null, created_at: string|null, framework?: string|null, healthy?: bool|null, allocation?: array{cpu_cores: float|null, memory_bytes: int|null, disk_bytes: int|null}, usage?: array{cpu_percent: float|null, memory_bytes: int|null, memory_limit_bytes: int|null}|null, disk?: array{bytes: int, files_bytes: int|null, docker_bytes: int|null, measured_at: string}|null, containers?: list<array{name: string, service: string|null, cpu_percent: float|null, memory_bytes: int|null, memory_limit_bytes: int|null}>}
     */
    public static function of(Application $app, ?array $project, ?array $containers = null): array
    {
        $created = $app->engine_created_at ?? $app->panel_created_at;
        $domain = $app->presentedDomain();
        $facts = [
            'domain' => $domain !== null && $domain !== '' ? $domain : null,
            'created_at' => $created !== null ? $created->copy()->utc()->format('Y-m-d\TH:i:s\Z') : null,
        ];
        if ($project === null) {
            return $facts;
        }

        $details = Payload::object($project['details'] ?? null);
        $config = Payload::object($project['config'] ?? null);
        $engineApp = Payload::object($project['app'] ?? null);
        $healthy = Payload::bool($details['health_healthy'] ?? null);

        $facts += [
            'framework' => self::text($engineApp['label'] ?? null, 64) ?? self::text($engineApp['framework'] ?? null, 64),
            'healthy' => $healthy,
            // The project's limits: CPUs, MB and MB, where none (0 or -1) is no limit of its own.
            'allocation' => [
                'cpu_cores' => is_numeric($config['cpu_limit'] ?? null) && (float) $config['cpu_limit'] > 0 ? round((float) $config['cpu_limit'], 2) : null,
                'memory_bytes' => self::megabytes($config['memory_limit'] ?? null),
                'disk_bytes' => self::megabytes($config['disk_space_limit'] ?? null),
            ],
            'usage' => self::usage(Payload::object($project['usage'] ?? null)),
            'disk' => self::disk(Payload::object($project['disk'] ?? null)),
        ];
        if ($containers !== null) {
            $facts['containers'] = array_values(array_filter(array_map(self::container(...), $containers)));
        }

        return $facts;
    }

    /**
     * Whether the app is down, up, or neither can be told (building, never
     * deployed, suspended): down while its container is not running or its
     * last health check failed, up while it runs and that check did not fail.
     *
     * @param  array<string, mixed>  $project
     */
    public static function isUp(array $project): ?bool
    {
        $status = Payload::string(Payload::object($project['app'] ?? null)['status'] ?? null);
        $healthy = Payload::bool(Payload::object($project['details'] ?? null)['health_healthy'] ?? null);

        return match (true) {
            ($project['status'] ?? null) === 'suspended' => null,
            $status === 'down' || ($status === 'live' && $healthy === false) => false,
            $status === 'live' => true,
            default => null,
        };
    }

    /**
     * A plain sentence for the customer on why the app counts as down.
     *
     * @param  array<string, mixed>  $project
     */
    public static function downReason(array $project): string
    {
        return Payload::string(Payload::object($project['app'] ?? null)['status'] ?? null) === 'down'
            ? 'The app is not running.'
            : 'The app did not pass its last health check.';
    }

    /**
     * @param  array<string, mixed>  $usage
     * @return array{cpu_percent: float|null, memory_bytes: int|null, memory_limit_bytes: int|null}|null
     */
    private static function usage(array $usage): ?array
    {
        $sample = [
            'cpu_percent' => self::percent($usage['cpu_percent'] ?? null),
            'memory_bytes' => self::bytes($usage['memory_bytes'] ?? null),
            'memory_limit_bytes' => self::bytes($usage['memory_limit_bytes'] ?? null),
        ];

        return $sample['cpu_percent'] === null && $sample['memory_bytes'] === null ? null : $sample;
    }

    /**
     * The Engine measures a project's disk every 15 minutes: its files and its
     * own Docker data (`docker_bytes`, null without any).
     *
     * @param  array<string, mixed>  $disk
     * @return array{bytes: int, files_bytes: int|null, docker_bytes: int|null, measured_at: string}|null
     */
    private static function disk(array $disk): ?array
    {
        $bytes = self::bytes($disk['total_bytes'] ?? null);
        $measuredAt = self::time($disk['measured_at'] ?? null);

        return $bytes === null || $measuredAt === null ? null : [
            'bytes' => $bytes,
            'files_bytes' => self::bytes($disk['files_bytes'] ?? null),
            'docker_bytes' => self::bytes($disk['docker_bytes'] ?? null),
            'measured_at' => $measuredAt,
        ];
    }

    /**
     * @param  array<string, mixed>  $container
     * @return array{name: string, service: string|null, cpu_percent: float|null, memory_bytes: int|null, memory_limit_bytes: int|null}|null
     */
    private static function container(array $container): ?array
    {
        $name = self::text($container['name'] ?? null, 255);

        return $name === null ? null : [
            'name' => $name,
            'service' => self::text($container['service'] ?? null, 64),
            'cpu_percent' => self::percent($container['cpu_percent'] ?? null),
            'memory_bytes' => self::bytes($container['memory_bytes'] ?? null),
            'memory_limit_bytes' => self::bytes($container['memory_limit_bytes'] ?? null),
        ];
    }

    private static function text(mixed $value, int $max): ?string
    {
        $value = trim(Payload::string($value));

        return $value !== '' ? mb_substr($value, 0, $max) : null;
    }

    /** A share of one core (it can exceed 100), one decimal. */
    private static function percent(mixed $value): ?float
    {
        return is_numeric($value) && (float) $value >= 0 ? round((float) $value, 1) : null;
    }

    private static function bytes(mixed $value): ?int
    {
        return is_numeric($value) && (float) $value >= 0 ? (int) $value : null;
    }

    /** A limit in MB as bytes; null for none (null, 0 or -1). */
    private static function megabytes(mixed $value): ?int
    {
        return is_numeric($value) && (float) $value > 0 ? (int) round((float) $value * 1048576.0) : null;
    }

    private static function time(mixed $value): ?string
    {
        $value = Payload::string($value);
        if ($value === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->utc()->format('Y-m-d\TH:i:s\Z');
        } catch (Throwable) {
            return null;
        }
    }
}
