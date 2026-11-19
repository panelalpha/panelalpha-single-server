<?php

namespace PanelAlpha\Community\Hub;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\Api\ContainersApi;
use PanelAlpha\EngineClient\Api\ServerApi;
use PanelAlpha\EngineClient\Api\SystemApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Support\Payload;
use PanelAlpha\Hub\Contracts\HubHost;
use PanelAlpha\Hub\Contracts\HubPanel;
use PanelAlpha\Hub\HubClient;
use Throwable;

/**
 * What the Community panel tells PanelAlpha Hub: product `single-server-community`, the
 * panel's own address, the Engine host's name and IPv4 address, no licence, the
 * synced projects with their ids, addresses and Engine facts, the server's
 * usage, throughput and host facts, and the Engine version.
 */
final class CommunityHubPanel implements HubHost, HubPanel
{
    private const int MAX_APPS = 500;

    /** How old the mirror's Engine answer may be to stand for now: the sync runs every minute. */
    private const int FRESH_SECONDS = 300;

    /** Engine calls for containers per report, so a large panel cannot make the report slow. */
    private const int MAX_CONTAINER_READS = 50;

    /** The Engine container's own host name, which its Docker daemon reports when it runs in it. */
    private const string ENGINE_CONTAINER_NAME = 'engine';

    /** The report's interval: `hub:report` runs every five minutes. */
    private const int INTERVAL_MINUTES = 5;

    /** Throughput in bytes per second, named as the Engine's `metrics/history` names it. */
    private const array RATES = ['net_in_bps', 'net_out_bps', 'disk_read_bps', 'disk_write_bps'];

    /** @var array<string, mixed>|null */
    private ?array $system = null;

    private ?EngineClient $engine = null;

    public function __construct(
        private readonly EngineResolver $engines,
        private readonly ApplicationRepository $applications,
        private readonly PanelUrl $panelUrl,
    ) {}

    public function product(): string
    {
        return self::COMMUNITY;
    }

    public function version(): string
    {
        return config()->string('community.panel_version');
    }

    public function adminUrl(): string
    {
        return HubClient::origin($this->panelUrl->base());
    }

    public function hostname(string $adminUrl): string
    {
        return $this->serverName() ?? (string) parse_url($adminUrl, PHP_URL_HOST);
    }

    /**
     * The server's own name, never a container's: the Engine's `host.hostname`
     * when it is a full name, else the name the Engine holds a certificate for
     * (`cert_domain`, the server's name the panel itself starts on). The Engine
     * reads `host.hostname` from its Docker daemon, which names its own
     * container (`engine`) when it runs in one: a bare name is the last
     * resort, and that one never.
     */
    private function serverName(): ?string
    {
        $system = $this->system();
        $host = mb_substr(trim(Payload::string(Payload::object($system['host'] ?? null)['hostname'] ?? null)), 0, 255);
        if (str_contains($host, '.')) {
            return $host;
        }
        $certified = trim(Payload::string($system['cert_domain'] ?? null));
        if (str_contains($certified, '.') && filter_var($certified, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false) {
            return $certified;
        }

        return $host !== '' && $host !== self::ENGINE_CONTAINER_NAME ? $host : null;
    }

    public function ip(): string
    {
        return Payload::string($this->system()['default_ipv4'] ?? null);
    }

    public function licenseKey(): ?string
    {
        return null;
    }

    /**
     * The synced applications under their Client Area id, from the local
     * mirror: the Engine's `projects/all` answer it keeps (`engine_payload`,
     * synced every minute) gives each its facts while that sync is recent.
     * Only a running container project costs an Engine call, for its
     * containers. Community has one owner, so any user sees every application.
     */
    public function apps(): array
    {
        $apps = [];
        $containerReads = 0;
        foreach ($this->mirrored() as $app) {
            $name = self::appName($app);
            if ($name === '') {
                continue;
            }
            $row = [
                'name' => $name,
                'type' => (string) $app->type,
                'status' => (string) $app->status,
            ];
            // Stable and never reused (SQLite's AUTOINCREMENT): the id in every Client Area URL.
            if ($app->exists) {
                $row = ['id' => (string) $app->id] + $row;
            }
            // The site's address, so the Hub can link the app like an Engine's.
            $url = $app->url();
            if ($url !== '') {
                $row['public_url'] = $url;
            }

            $project = self::freshPayload($app);
            $containers = null;
            if ($project !== null && $app->isContainer() && Payload::object($project['usage'] ?? null) !== [] && $containerReads < self::MAX_CONTAINER_READS) {
                $containerReads++;
                $containers = $this->containers($app);
            }
            $apps[] = $row + HubAppFacts::of($app, $project, $containers);
        }

        return $apps;
    }

    /**
     * The name the Client Area shows (ProjectPresenter): `name` is null on most
     * projects, and the Hub refuses the whole report (422) for an empty
     * `apps.*.name`, which leaves the pairing never confirmed. Empty only for a
     * project without a name, an Engine username and a domain.
     */
    public static function appName(Application $app): string
    {
        $name = (string) ($app->name ?? '');
        if ($name === '') {
            $name = $app->engine_username !== '' ? $app->engine_username : (string) ($app->domain ?? '');
        }

        return $name;
    }

    /**
     * The mirror's last Engine answer for an app while the sync is recent; null
     * once the Engine has not been read for a while (down, or never synced).
     *
     * @return array<string, mixed>|null
     */
    public static function freshPayload(Application $app): ?array
    {
        $synced = $app->synced_at;
        if (! is_array($app->engine_payload) || $synced === null || $synced->lt(now()->subSeconds(self::FRESH_SECONDS))) {
            return null;
        }

        return $app->engine_payload;
    }

    /**
     * The applications the Hub lists, in Client Area order (at most 500).
     *
     * @return Collection<int, Application>
     */
    public function mirrored(): Collection
    {
        $model = config()->string('auth.providers.users.model');
        $user = is_a($model, Authenticatable::class, true) && is_a($model, Model::class, true)
            ? $model::query()->first()
            : null;
        if (! $user instanceof Authenticatable) {
            return new Collection;
        }

        return $this->applications->forUser($user, false)->take(self::MAX_APPS)->values();
    }

    /**
     * The latest sample of each of an app's containers; null when the Engine
     * does not answer, so the app keeps the rest of its facts.
     *
     * @return list<array<string, mixed>>|null
     */
    private function containers(Application $app): ?array
    {
        try {
            return (new ContainersApi($app->engine()))->metrics($app->engineProject());
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * The server the panel runs on, from its Engine, as the Hub reads a
     * connected Engine: the averages of the last five minutes (the report's
     * interval) from `metrics/history`, the percentages from `metrics/current`
     * where the history has none, and the `system/info` host totals. Null when
     * the Engine answers none of it.
     */
    public function resourceUsage(): ?array
    {
        $recent = $this->recentAverages();
        $current = null;
        $percent = function (string $metric, string $currentKey) use ($recent, &$current): ?float {
            if (isset($recent[$metric])) {
                return self::percent($recent[$metric]);
            }
            $current ??= $this->currentMetrics();

            return self::percent($current[$currentKey] ?? null);
        };
        $host = Payload::object($this->system()['host'] ?? null);

        $usage = [
            'cpu_percent' => $percent('cpu_percent', 'cpu_usage_percent'),
            'ram_percent' => $percent('ram_percent', 'ram_usage_percent'),
            'disk_percent' => $percent('disk_percent', 'disk_usage_percent'),
            'cpu_cores' => self::count($host['cpu_cores'] ?? null),
            'ram_total_bytes' => self::count($host['memory_total_bytes'] ?? null),
            'disk_total_bytes' => self::count($host['disk_total_bytes'] ?? null),
        ];
        foreach (self::RATES as $rate) {
            $usage[$rate] = isset($recent[$rate]) ? (int) round(max(0.0, $recent[$rate])) : null;
        }

        return array_filter($usage, fn ($v) => $v !== null) === [] ? null : $usage;
    }

    /**
     * The machine the panel runs on, from the Engine's `system/info` host
     * facts; null when the Engine names none.
     */
    public function host(): ?array
    {
        $system = $this->system();
        $host = Payload::object($system['host'] ?? null);
        $ipv4 = Payload::string($host['ipv4'] ?? null);

        $facts = [
            'hostname' => $this->serverName(),
            'os' => self::text($host['os'] ?? null, 128),
            'kernel' => self::text($host['kernel'] ?? null, 128),
            'uptime_seconds' => is_numeric($host['uptime_seconds'] ?? null) && (int) $host['uptime_seconds'] >= 0 ? (int) $host['uptime_seconds'] : null,
            'public_ipv4' => filter_var($ipv4 !== '' ? $ipv4 : Payload::string($system['default_ipv4'] ?? null), FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) ?: null,
        ];

        return array_filter($facts, fn ($v) => $v !== null) === [] ? null : $facts;
    }

    public function engineVersion(): ?string
    {
        $version = Payload::string($this->system()['version'] ?? null);

        return $version !== '' ? $version : null;
    }

    /**
     * The Engine's system info, read once per request.
     *
     * @return array<string, mixed>
     */
    private function system(): array
    {
        if ($this->system === null) {
            try {
                $this->system = (new SystemApi($this->engine()))->info();
            } catch (Throwable) {
                // The Engine being down must not stop the connect request.
                $this->system = [];
            }
        }

        return $this->system;
    }

    /** Community has one Engine: the panel's own. */
    private function engine(): EngineClient
    {
        return $this->engine ??= $this->engines->forEngine($this->engines->defaultEngineId());
    }

    /**
     * Each metric's average over the last five one-minute buckets of
     * `metrics/history` (range 1h), the buckets without samples left out;
     * empty when the Engine answers none (an older Engine, a stopped collector).
     *
     * @return array<string, float>
     */
    private function recentAverages(): array
    {
        try {
            $buckets = array_slice((new ServerApi($this->engine()))->history('1h'), -self::INTERVAL_MINUTES);
        } catch (Throwable) {
            return [];
        }

        $averages = [];
        foreach (['cpu_percent', 'ram_percent', 'disk_percent', ...self::RATES] as $metric) {
            $sum = 0.0;
            $count = 0;
            foreach ($buckets as $bucket) {
                $value = is_numeric($bucket[$metric] ?? null) ? (float) $bucket[$metric] : null;
                if ($value !== null) {
                    $sum += $value;
                    $count++;
                }
            }
            if ($count > 0) {
                $averages[$metric] = $sum / (float) $count;
            }
        }

        return $averages;
    }

    /**
     * @return array<string, mixed>
     */
    private function currentMetrics(): array
    {
        try {
            return (new ServerApi($this->engine()))->metrics('current');
        } catch (Throwable) {
            return [];
        }
    }

    private static function text(mixed $value, int $max): ?string
    {
        $value = trim(Payload::string($value));

        return $value !== '' ? mb_substr($value, 0, $max) : null;
    }

    private static function percent(mixed $value): ?float
    {
        return is_numeric($value) ? round(max(0.0, min(100.0, (float) $value)), 1) : null;
    }

    private static function count(mixed $value): ?int
    {
        return is_numeric($value) && (int) $value > 0 ? (int) $value : null;
    }
}
