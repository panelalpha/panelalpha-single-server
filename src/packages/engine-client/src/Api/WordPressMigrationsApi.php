<?php

namespace PanelAlpha\EngineClient\Api;

use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Support\Payload;
use Psr\Http\Message\StreamInterface;

/**
 * The Engine's WordPress site import (Engine 2.2.0). Engine-wide routes under
 * `/wordpress/migrations`, all answering a **bare** JSON object (no `data`
 * envelope).
 *
 * Body of `test` and `start`: `{url, method?: wp_admin|manual_plugin,
 * login_url?, username?, password?, source_token?, source_ip?, domain?,
 * project?, project_name?}` (`WordpressMigrationStoreRequest::rulesFor`);
 * `wp_admin` needs `username` and `password`, `manual_plugin` the 64-hex
 * `source_token` of a plugin package.
 */
final class WordPressMigrationsApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * The connection test: `{ok: true, url, login_url, rest_mode,
     * wordpress_version, domain}` or `{ok: false, error_type, message}` – a
     * failed source is a 200, not an exception; only invalid input is a 422.
     *
     * Engine: core/app/Http/Controllers/WordpressMigrationController.php:194 -> test
     * (`SourceProbe::run`, `ImportDomainCheck`).
     *
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    public function test(array $body): array
    {
        return Payload::object($this->engine->withTimeout(self::SOURCE_TIMEOUT_SECONDS)->post('wordpress/migrations/test', $body)->json());
    }

    /**
     * A migrator plugin package for the `manual_plugin` method: `{token,
     * download_url, expires_at}`. The token is baked into the zip behind the
     * signed `download_url` (valid 24 h, no bearer).
     *
     * Engine: core/app/Http/Controllers/WordpressMigrationController.php:219 -> pluginPackage.
     *
     * @return array{token: string, download_url: string}
     */
    public function pluginPackage(): array
    {
        $package = Payload::object($this->engine->post('wordpress/migrations/plugin-package')->json());
        $token = Payload::string($package['token'] ?? null);
        $url = Payload::string($package['download_url'] ?? null);
        if (preg_match('/^[0-9a-f]{64}$/', $token) !== 1 || $url === '') {
            throw new EngineRequestException(502, 'The Engine did not return a plugin package.');
        }

        return ['token' => $token, 'download_url' => $url];
    }

    /**
     * Open the zip behind a `download_url` from {@see pluginPackage()} and
     * return its body as a stream, before anything is sent to the browser. The
     * signed link is built from the address the panel called the Engine on, so
     * only a link on this connection's own origin is followed – anything else
     * is refused (502) without a request.
     *
     * Engine: core/app/Http/Controllers/WordpressMigrationController.php:238 -> downloadPluginPackage
     * (`application/zip`, attachment `wordpress-migrator.zip`).
     */
    public function openPluginPackage(string $downloadUrl): StreamInterface
    {
        $base = rtrim($this->engine->connection()->url, '/');
        $origin = self::origin($base);
        if ($origin === null || self::origin($downloadUrl) !== $origin) {
            throw new EngineRequestException(502, 'The Engine returned a plugin link on another address.');
        }

        $basePath = rtrim((string) parse_url($base, PHP_URL_PATH), '/');
        $path = (string) parse_url($downloadUrl, PHP_URL_PATH);
        if ($basePath !== '' && str_starts_with($path, $basePath.'/')) {
            $path = substr($path, strlen($basePath) + 1);
        }
        $query = (string) parse_url($downloadUrl, PHP_URL_QUERY);

        return $this->engine->stream('GET', ltrim($path, '/').($query === '' ? '' : '?'.$query))
            ->toPsrResponse()
            ->getBody();
    }

    /**
     * Start an import (202): the migration status `{id, status, steps,
     * progress, target_project, target_domain, …}`. Target refusals are 422
     * `problems[].code` (`domain_taken`, `project_not_empty`, …).
     *
     * Engine: core/app/Http/Controllers/WordpressMigrationController.php:125 -> store
     * (`WordpressMigration::toStatusArray`).
     *
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    public function start(array $body): array
    {
        return Payload::object($this->engine->withTimeout(self::SOURCE_TIMEOUT_SECONDS)->post('wordpress/migrations', $body)->json());
    }

    /**
     * Engine: core/app/Http/Controllers/WordpressMigrationController.php:319 -> show.
     *
     * @return array<string, mixed>
     */
    public function show(int $id): array
    {
        return Payload::object($this->engine->get('wordpress/migrations/'.$id)->json());
    }

    /**
     * Resume a failed (or stale) import (202); 409 when it may not resume.
     *
     * Engine: core/app/Http/Controllers/WordpressMigrationController.php:366 -> resume.
     *
     * @return array<string, mixed>
     */
    public function resume(int $id): array
    {
        return Payload::object($this->engine->post('wordpress/migrations/'.$id.'/resume')->json());
    }

    /**
     * Cancel an import and remove what it made (202); 409 once completed or
     * already cancelled.
     *
     * Engine: core/app/Http/Controllers/WordpressMigrationController.php:407 -> cancel.
     *
     * @return array<string, mixed>
     */
    public function cancel(int $id): array
    {
        return Payload::object($this->engine->post('wordpress/migrations/'.$id.'/cancel')->json());
    }

    /**
     * Delete an ended import's record (204); 409 while it still runs.
     *
     * Engine: core/app/Http/Controllers/WordpressMigrationController.php:435 -> destroy.
     */
    public function delete(int $id): void
    {
        $this->engine->delete('wordpress/migrations/'.$id);
    }

    /**
     * The test and the start contact the source site (and the start resolves
     * its target) synchronously; give them more than the default 30 s.
     */
    public const int SOURCE_TIMEOUT_SECONDS = 120;

    private static function origin(string $url): ?string
    {
        $scheme = parse_url($url, PHP_URL_SCHEME);
        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($scheme) || ! is_string($host) || $host === '') {
            return null;
        }
        $port = parse_url($url, PHP_URL_PORT);

        return strtolower($scheme).'://'.strtolower($host).(is_int($port) ? ':'.$port : '');
    }
}
