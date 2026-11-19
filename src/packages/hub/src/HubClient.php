<?php

namespace PanelAlpha\Hub;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use PanelAlpha\Hub\Contracts\HubHost;
use PanelAlpha\Hub\Contracts\HubPanel;

/**
 * Calls to PanelAlpha Hub; the wire contract is `docs/hub-connect-contract.md`
 * (old `packages/api/app/Lib/Hub/HubClient.php`).
 *
 * Uses the plain Http client on purpose: nothing here logs request or response
 * bodies, and device_code / server_secret must never be logged. Redirects are
 * never followed.
 */
final class HubClient
{
    private const int TIMEOUT = 15;

    private const int POLL_TIMEOUT = 5;

    /** The Hub's cap on one item of the report's `apps`, in bytes of JSON. */
    private const int MAX_APP_BYTES = 4096;

    public function __construct(
        private readonly HubPairing $pairing,
        private readonly HubPanel $panel,
    ) {}

    /**
     * POST /api/panel/v1/connect-requests
     */
    public function createConnectRequest(string $adminUrl): Response
    {
        return $this->unsigned('api/panel/v1/connect-requests', [
            'product' => $this->panel->product(),
            'panel' => [
                'version' => $this->panel->version(),
                'admin_url' => $adminUrl,
                'hostname' => $this->panel->hostname($adminUrl),
                'ip' => $this->panel->ip(),
            ],
            'license_key' => $this->panel->licenseKey(),
        ]);
    }

    /**
     * POST /api/panel/v1/install-codes/claim (contract 1.7): the installer's
     * `--hub-code`, turned into the pairing. `email` is the admin the install
     * was made for; the Hub accepts the code only for its creator's email.
     */
    public function claimInstallCode(string $code, string $email, string $adminUrl): Response
    {
        return $this->unsigned('api/panel/v1/install-codes/claim', [
            'code' => $code,
            'email' => $email,
            'product' => $this->panel->product(),
            'panel' => [
                'version' => $this->panel->version(),
                'admin_url' => $adminUrl,
                'hostname' => $this->panel->hostname($adminUrl),
                'ip' => $this->panel->ip(),
            ],
        ]);
    }

    /**
     * @param  float  $maxSeconds  time left in the caller's poll budget; the timeout is capped at it (1 s floor)
     */
    public function pollConnectRequest(string $deviceCode, float $maxSeconds = self::POLL_TIMEOUT): Response
    {
        $timeout = min((float) self::POLL_TIMEOUT, max(1.0, $maxSeconds));

        return $this->unsigned('api/panel/v1/connect-requests/poll', ['device_code' => $deviceCode], $timeout);
    }

    public function cancelConnectRequest(string $deviceCode): Response
    {
        return $this->unsigned('api/panel/v1/connect-requests/cancel', ['device_code' => $deviceCode]);
    }

    /**
     * Signed POST /api/panel/v1/report. A 401 means the Hub no longer knows
     * this pairing, so it is forgotten.
     */
    public function report(): Response
    {
        $body = [
            'apps' => array_map(self::fitApp(...), $this->panel->apps()),
            'panel_version' => $this->panel->version(),
            // Both products accept Hub login tickets (contract §5).
            'admin_sso_supported' => true,
            'admin_url' => $this->reportedAdminUrl(),
            'product' => $this->panel->product(),
        ];
        // What the Hub shows for a connected Engine, when the panel can read it.
        $usage = $this->panel->resourceUsage();
        if ($usage !== null) {
            $body['resource_usage'] = $usage;
        }
        $engineVersion = $this->panel->engineVersion();
        if ($engineVersion !== null && $engineVersion !== '') {
            $body['engine_version'] = $engineVersion;
        }
        $host = $this->panel instanceof HubHost ? $this->panel->host() : null;
        if ($host !== null) {
            $body['host'] = $host;
        }

        $response = $this->signed('api/panel/v1/report', $body);

        if ($response->status() === 401) {
            $this->pairing->forget();
        }

        return $response;
    }

    /**
     * Signed POST /api/panel/v1/events (§6a): a batch of at most 200 monitoring
     * events. A 401 means the Hub no longer knows this pairing, so it is
     * forgotten, as in `report()`.
     *
     * @param  list<array<string, mixed>>  $events
     */
    public function events(array $events): Response
    {
        $response = $this->signed('api/panel/v1/events', ['events' => $events]);

        if ($response->status() === 401) {
            $this->pairing->forget();
        }

        return $response;
    }

    /**
     * An app item within the Hub's 4 KB per app: it refuses the whole report
     * (422) for a bigger one, so the details go first, the least needed first,
     * down to the keys every panel sends.
     *
     * @param  array<string, mixed>  $app
     * @return array<string, mixed>
     */
    public static function fitApp(array $app): array
    {
        foreach (['containers', 'disk', 'usage', 'allocation', 'framework'] as $key) {
            // Measured as the Hub measures it: PHP's default JSON, escaped slashes and unicode.
            if (strlen((string) json_encode($app)) <= self::MAX_APP_BYTES) {
                break;
            }
            unset($app[$key]);
        }

        return $app;
    }

    /**
     * Signed POST /api/panel/v1/credential (§10): a short-lived token the Hub
     * signs for another PanelAlpha service, `{"token", "expires_at"}`. The
     * purpose `go` is the bearer of PanelAlpha Go's catalog API. A 401 means the
     * Hub no longer knows this pairing, so it is forgotten, as in `report()`.
     */
    public function credential(string $purpose): Response
    {
        $response = $this->signed('api/panel/v1/credential', ['purpose' => $purpose]);

        if ($response->status() === 401) {
            $this->pairing->forget();
        }

        return $response;
    }

    /**
     * Where the Hub sends a browser: the panel's address now, so the Hub
     * follows a panel that moved (a Settings URL, the Engine renaming its
     * domain); the origin stored at pairing time only when the panel names
     * none.
     */
    private function reportedAdminUrl(): string
    {
        $current = $this->panel->adminUrl();

        return $current !== '' ? $current : (string) $this->pairing->adminUrl();
    }

    /**
     * Signed POST /api/panel/v1/disconnect: the Hub removes its side of the
     * pairing (the caller forgets the panel's side).
     */
    public function disconnect(): Response
    {
        return $this->signed('api/panel/v1/disconnect', []);
    }

    /**
     * Scheme, host and optional port of a URL, without path.
     */
    public static function origin(string $url): string
    {
        $parts = parse_url($url);
        if (! isset($parts['scheme'], $parts['host']) || $parts['scheme'] === '' || $parts['host'] === '') {
            return rtrim($url, '/');
        }

        return $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');
    }

    /**
     * Whether a URL the Hub sent back is on the configured Hub origin. Anything
     * else (another host, another scheme, javascript:) is not followed or stored.
     */
    public static function isHubUrl(string $url): bool
    {
        $hub = parse_url(config()->string('hub.url'));
        $target = parse_url($url);
        if (! isset($hub['scheme'], $hub['host'], $target['scheme'], $target['host'])) {
            return false;
        }
        if (! in_array(strtolower($target['scheme']), ['http', 'https'], true)) {
            return false;
        }

        return self::originKey($hub) === self::originKey($target);
    }

    /**
     * @param  array<string, int|string>  $parts
     */
    private static function originKey(array $parts): string
    {
        $scheme = strtolower((string) $parts['scheme']);
        $port = $parts['port'] ?? ($scheme === 'https' ? 443 : 80);

        return $scheme.'://'.strtolower((string) $parts['host']).':'.$port;
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function unsigned(string $path, array $body, int|float $timeout = self::TIMEOUT): Response
    {
        return Http::timeout($timeout)
            ->withoutRedirecting()
            ->acceptJson()
            ->asJson()
            ->post($this->url($path), $body);
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function signed(string $path, array $body): Response
    {
        $raw = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $timestamp = (string) time();
        $canonical = implode("\n", ['POST', $path, $timestamp, hash('sha256', $raw)]);

        return Http::timeout(self::TIMEOUT)
            ->withoutRedirecting()
            ->acceptJson()
            ->withHeaders([
                'X-Server-Id' => (string) $this->pairing->serverId(),
                'X-Timestamp' => $timestamp,
                'X-Signature' => hash_hmac('sha256', $canonical, (string) $this->pairing->serverSecret()),
            ])
            ->withBody($raw, 'application/json')
            ->post($this->url($path));
    }

    private function url(string $path): string
    {
        return rtrim($this->pairing->hubUrl(), '/').'/'.$path;
    }
}
