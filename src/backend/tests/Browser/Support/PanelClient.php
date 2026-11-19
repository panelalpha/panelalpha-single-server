<?php

namespace Tests\Browser\Support;

use GuzzleHttp\Client;
use GuzzleHttp\Cookie\CookieJar;
use RuntimeException;

/**
 * Thin HTTP client for the live panel the Dusk suite drives, used to replace the
 * old tests' database reads with API reads. It signs in
 * once per process with the credentials from DUSK_USER_FILE and keeps the
 * session cookie, so it never opens more sessions than necessary.
 */
final class PanelClient
{
    private static ?self $instance = null;

    private readonly CookieJar $cookies;

    private readonly Client $http;

    /**
     * @var array<string, mixed>|null
     */
    private ?array $home = null;

    private function __construct()
    {
        $base = rtrim(DuskEnvironment::baseUrl(), '/');
        $this->cookies = new CookieJar();
        $this->http = new Client([
            'base_uri' => $base.'/',
            'cookies' => $this->cookies,
            'http_errors' => false,
            'headers' => [
                'Accept' => 'application/json',
                'Origin' => $base,
            ],
        ]);

        $this->authenticate();
    }

    public static function instance(): self
    {
        return self::$instance ??= new self();
    }

    /**
     * The `/home` payload of the signed-in test user.
     *
     * @return array<string, mixed>
     */
    public function home(): array
    {
        if ($this->home === null) {
            $this->home = $this->read('GET', 'api/home');
        }

        return $this->home;
    }

    /**
     * The device/session rows the CA renders in My Account → Active Devices.
     *
     * @return list<array<string, mixed>>
     */
    public function devices(): array
    {
        $payload = $this->read('GET', 'api/user/devices');
        $rows = $payload['data'] ?? [];

        return array_values(array_filter($rows, 'is_array'));
    }

    /**
     * The user's notifications as the CA list endpoint returns them; used to
     * replace the old `notifications` table read.
     *
     * @return list<array<string, mixed>>
     */
    public function notifications(): array
    {
        $payload = $this->read('GET', 'api/notifications');
        $rows = $payload['data'] ?? [];

        return array_values(array_filter($rows, 'is_array'));
    }

    private function authenticate(): void
    {
        $this->http->get('api/csrf-cookie');

        $user = DuskEnvironment::user();
        $this->http->post('api/login', [
            'headers' => ['X-XSRF-TOKEN' => $this->xsrfToken()],
            'json' => ['email' => $user->email, 'password' => $user->password],
        ]);
    }

    private function xsrfToken(): string
    {
        foreach ($this->cookies->toArray() as $cookie) {
            if (($cookie['Name'] ?? null) === 'XSRF-TOKEN') {
                return urldecode((string) ($cookie['Value'] ?? ''));
            }
        }

        throw new RuntimeException('The panel did not set an XSRF-TOKEN cookie.');
    }

    /**
     * @return array<string, mixed>
     */
    private function read(string $method, string $path): array
    {
        $response = $this->http->request($method, $path, [
            'headers' => ['X-XSRF-TOKEN' => $this->xsrfToken()],
        ]);

        if ($response->getStatusCode() >= 400) {
            throw new RuntimeException(
                "The panel answered {$response->getStatusCode()} for {$method} {$path}."
            );
        }

        $decoded = json_decode((string) $response->getBody(), true);

        return is_array($decoded) ? $decoded : [];
    }
}
