<?php

namespace Tests\Feature\ClientArea\Logs;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressInstall;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Webserver, PHP and WordPress logs.
 *
 * PHP logs: `GET /projects/{id}/php-logs` and its
 * download read the Engine's `GET /projects/{u}/php/error-log?lines=`
 * (core/app/Http/Controllers/User/PhpController.php:97 -> errorLog,
 * `{data: {lines, file, size, mtime, truncated}}` built by
 * core/app/Lib/Project/PhpErrorLog.php:126 for a classic project and :73 for a
 * dind one) instead of the Apache error log. The CA reads `response.data.data`
 * as the log text (packages/client-area/src/router/fetchData.js:69) and builds
 * the download URL by hand (`/instances/{id}/php-logs/download`,
 * packages/client-area/src/views/instance/advanced/Logs.vue:634); the response
 * shape stays the old `{data: string}`.
 *
 * Paged webserver log (client-area-next `logs-paged-table`):
 * `GET /projects/{id}/webserver-logs/{filename}?page=N[&size=S]`.
 * The old CA calls the same route without a query
 * (packages/client-area/src/router/fetchData.js:42, reads `response.data.data`
 * at :43) and gets the old `{data: string}` tail (`Range: bytes=-51200`);
 * `page` and `size` are sent only by client-area-next, so the `CA:` citations
 * of the paged tests name the route's old call site.
 * - Request: `page` integer >= 1, `size` integer >= 0 (the size page 1
 *   answered; used when `0 < size <= listed size`, else the listed size);
 *   anything else is a 422 on that field (`LogPageRequest`); a page past the
 *   last is a 422 on `page`.
 * - Engine: the size comes from `GET E:/projects/{u}/domains/{d}/log-files
 *   ?all_webservers=1` (core/app/Http/Controllers/User/Domain/LogFileController.php:36,
 *   `{data: [{file, path, mtime, size}]}`); a file it does not hold is a 404.
 *   The page is one `GET E:/.../log-files/{f}` with `Range: bytes=a-b`
 *   (LogFileController.php:70, a `BinaryFileResponse`: 206 for the range,
 *   416 for a range past the end); an empty file is not read.
 * - Window (`LogWindow`, 16384 bytes, 8192 extra): page k covers
 *   `[size-k*W, size-(k-1)*W)`, read from one byte before to 8192 bytes past
 *   (never past the listed size); it holds the lines starting inside, the last
 *   one completed.
 * - Response 200 `{data: {lines: string[], page, pages, size, window: 16384}}`,
 *   lines in file order without `\n`, invalid UTF-8 replaced; an Engine 416
 *   (the file shrank, e.g. a rotation) is a 409 `{message}`; Engine down 503,
 *   Engine 5xx 502; `general.view_webserver_logs` as before.
 *
 * Paged PHP log: `GET /projects/{id}/php-logs?page=N[&size=S]`, same
 * request rules, 200 shape, 409 and 422 as the webserver log, with
 * `general.view_php_logs`. The old CA calls the route without a query
 * (fetchData.js:68, reads `response.data.data` at :69) and keeps the old
 * `{data: string}`, so the `CA:` citations name that call site.
 * - A classic project lists `php_error.log` with the Engine's log files: the
 *   page is the same window on `log-files/php_error.log` (one Range read).
 * - A dind project has no such file: `lines` are the Engine's
 *   `GET E:/projects/{u}/php/error-log?lines=1000` (PhpController.php:97,
 *   PhpErrorLog.php:73) in file order as the one page (`page` 1, `pages` 1,
 *   `size` null); page 2 or later is a 422 on `page`.
 *
 * @see packages/client-area/src/views/instance/General.vue (log tabs)
 * @see Engine core/routes/api.php:187-188 (domains/{d}/log-files)
 */
class LogsTest extends TestCase
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

    public function test_webserver_log_list_maps_to_the_ca_shape(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

// Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:36
        Http::fake(['engine.example.com/api/projects/site1/domains/*/log-files*' => Http::response(['data' => [
            ['file' => 'access.log', 'path' => '/x/access.log', 'mtime' => 1, 'size' => 2048],
            ['file' => 'error.log', 'path' => '/x/error.log', 'mtime' => 1, 'size' => 1024],
        ]])]);

        // CA: packages/client-area/src/router/fetchData.js:29 (`Api.get('/instances/{id}/webserver-logs')`, rewritten to /projects)
        // CA reads: packages/client-area/src/router/fetchData.js:30 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs")
            ->assertOk()
            ->assertJsonPath('data.0.name', 'access.log')
            ->assertJsonPath('data.0.plain_text', true)
            ->assertJsonPath('data.0.size', 2048);
    }

    public function test_webserver_log_show_returns_the_tail(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

// Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
        Http::fake(['engine.example.com/api/projects/site1/domains/*/log-files/*' => Http::response("line one\nline two\n")]);

        // CA: packages/client-area/src/router/fetchData.js:42 (`Api.get('/instances/{id}/webserver-logs/{file}')`)
        // CA reads: packages/client-area/src/router/fetchData.js:43 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log")
            ->assertOk()
            ->assertJsonPath('data', "line one\nline two\n");

        // A tail, not the whole file: 50 KB.
        Http::assertSent(fn ($r) => str_contains($r->url(), '/log-files/access.log')
            && $r->hasHeader('Range', 'bytes=-51200'));
    }

    public function test_webserver_log_show_rejects_a_bad_filename(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/router/fetchData.js:42 (`Api.get('/instances/{id}/webserver-logs/{file}')`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/".rawurlencode('../etc/passwd'))
            ->assertNotFound();
    }

    public function test_php_logs_read_the_engine_php_error_log(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/PhpController.php:97 -> errorLog; core/app/Lib/Project/PhpErrorLog.php:126 (classic)
        Http::fake(['engine.example.com/api/projects/site1/php/error-log*' => Http::response(['data' => [
            'lines' => ['[13-Oct-2026 10:00:00 UTC] PHP Warning:  Undefined variable $x', '[13-Oct-2026 10:00:01 UTC] PHP Fatal error:  boom'],
            'file' => 'php_error.log',
            'size' => 120,
            'mtime' => 1760349601,
            'truncated' => false,
        ]])]);

        // CA: packages/client-area/src/router/fetchData.js:68 (`Api.get('/instances/{id}/php-logs')`)
        // CA reads: packages/client-area/src/router/fetchData.js:69 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs")
            ->assertOk()
            ->assertJsonPath('data', "[13-Oct-2026 10:00:00 UTC] PHP Warning:  Undefined variable \$x\n[13-Oct-2026 10:00:01 UTC] PHP Fatal error:  boom\n");

        // The view asks for the newest 1000 lines, and never the Apache log.
        Http::assertSent(fn ($r) => $r->method() === 'GET'
            && str_contains($r->url(), '/projects/site1/php/error-log')
            && $r['lines'] === 1000);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/log-files'));
    }

    public function test_php_logs_of_a_container_project_read_its_app_output(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);

        // Engine: core/app/Http/Controllers/User/PhpController.php:97 -> errorLog; core/app/Lib/Project/PhpErrorLog.php:73 (dind: container output, file null)
        Http::fake(['engine.example.com/api/projects/site1/php/error-log*' => Http::response(['data' => [
            'lines' => ['app-1  | PHP Notice:  container line'],
            'file' => null,
            'size' => 36,
            'mtime' => null,
            'truncated' => false,
        ]])]);

        // CA: packages/client-area/src/router/fetchData.js:68 (`Api.get('/instances/{id}/php-logs')`)
        // CA reads: packages/client-area/src/router/fetchData.js:69 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs")
            ->assertOk()
            ->assertJsonPath('data', "app-1  | PHP Notice:  container line\n");
    }

    public function test_an_empty_php_error_log_is_an_empty_string(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Lib/Project/PhpErrorLog.php:220 -> nothing() (no log file yet)
        Http::fake(['engine.example.com/api/projects/site1/php/error-log*' => Http::response(['data' => [
            'lines' => [], 'file' => null, 'size' => 0, 'mtime' => null, 'truncated' => false,
        ]])]);

        // CA: packages/client-area/src/router/fetchData.js:68 (`Api.get('/instances/{id}/php-logs')`)
        // CA reads: packages/client-area/src/views/instance/advanced/Logs.vue:252 (an empty string shows the empty state)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs")
            ->assertOk()
            ->assertJsonPath('data', '');
    }

    public function test_the_php_log_view_keeps_the_last_50_kb(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // 1000 lines of 99 characters + newline = 100000 bytes, over the old
        // 50 KB preview.
        $lines = array_map(static fn (int $i): string => str_pad((string) $i, 99, 'x'), range(1, 1000));

        // Engine: core/app/Http/Controllers/User/PhpController.php:97 -> errorLog; core/app/Lib/Project/PhpErrorLog.php:126 (truncated tail)
        Http::fake(['engine.example.com/api/projects/site1/php/error-log*' => Http::response(['data' => [
            'lines' => $lines, 'file' => 'php_error.log', 'size' => 500000, 'mtime' => 1760349601, 'truncated' => true,
        ]])]);

        // CA: packages/client-area/src/router/fetchData.js:68 (`Api.get('/instances/{id}/php-logs')`)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs")
            ->assertOk();

        // CA reads: packages/client-area/src/router/fetchData.js:69 (`response.data.data`)
        $data = (string) $response->json('data');
        $this->assertSame(51200, strlen($data));
        $this->assertStringEndsWith(str_pad('1000', 99, 'x')."\n", $data);
    }

    public function test_a_php_log_of_a_project_gone_from_the_engine_answers_404(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/PhpController.php:99 -> projectOr404
        Http::fake(['engine.example.com/api/projects/site1/php/error-log*' => Http::response(['message' => 'Project not found.'], 404)]);

        // CA: packages/client-area/src/router/fetchData.js:68 (`Api.get('/instances/{id}/php-logs')`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs")
            ->assertNotFound();
        // CA: packages/client-area/src/views/instance/advanced/Logs.vue:634 (the /instances download URL)
        $this->actingAs($user)
            ->get("/api/instances/{$application->id}/php-logs/download")
            ->assertNotFound();
    }

    public function test_wordpress_logs_read_wp_content_debug_log(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The document root is a domain detail, not a project one.
        Http::fake([
// Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/site1.example.com/public_html',
                ]],
            ]]),
// Engine: core/app/Http/Controllers/User/FileController.php:709
            'engine.example.com/api/projects/site1/files/download*' => Http::response('wp debug line'),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:55 (`Api.get('/instances/{id}/wordpress/logs')`)
        // CA reads: packages/client-area/src/router/fetchData.js:56 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/logs")
            ->assertOk()
            ->assertJsonPath('data', 'wp debug line');

        Http::assertSent(fn ($r) => str_contains($r->url(), 'files/download')
            && $r['path'] === 'site1.example.com/public_html/wp-content/debug.log');
    }

    public function test_wordpress_log_falls_back_to_domain_public_html(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
// Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
// Engine: core/app/Http/Controllers/User/FileController.php:709
            'engine.example.com/api/projects/site1/files/download*' => Http::response('wp debug line'),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:55 (`Api.get('/instances/{id}/wordpress/logs')`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/logs")
            ->assertOk();

        Http::assertSent(fn ($r) => str_contains($r->url(), 'files/download')
            && $r['path'] === 'site1.example.com/public_html/wp-content/debug.log');
    }

    public function test_wordpress_logs_read_the_subdirectory_installs_own_debug_log(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        WordPressInstall::query()->create([
            'application_id' => $application->id,
            'status' => WordPressInstall::FINISHED,
            'params' => ['dir' => 'blog', 'url' => 'https://site1.example.com/blog'],
        ]);

        Http::fake([
// Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/site1.example.com/public_html',
                ]],
            ]]),
// Engine: core/app/Http/Controllers/User/FileController.php:709
            // A fresh response per read: the read consumes the body, the download opens it.
            'engine.example.com/api/projects/site1/files/download*' => fn () => Http::response('blog debug line'),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:55 (`Api.get('/instances/{id}/wordpress/logs')`)
        // CA reads: packages/client-area/src/router/fetchData.js:56 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/logs")
            ->assertOk()
            ->assertJsonPath('data', 'blog debug line');

        Http::assertSent(fn ($r) => str_contains($r->url(), 'files/download')
            && $r['path'] === 'site1.example.com/public_html/blog/wp-content/debug.log');

        // CA: packages/client-area/src/router/fetchData.js:55 (the /instances download URL)
        $response = $this->actingAs($user)
            ->get("/api/instances/{$application->id}/wordpress/logs/download")
            ->assertOk();

        $this->assertSame('blog debug line', $response->streamedContent());
        // The download reads the same install path (no Range on the stream).
        Http::assertSent(fn ($r) => str_contains($r->url(), 'files/download') && ! $r->hasHeader('Range')
            && $r['path'] === 'site1.example.com/public_html/blog/wp-content/debug.log');
    }

    public function test_an_install_in_the_document_root_keeps_the_root_debug_log(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        WordPressInstall::query()->create([
            'application_id' => $application->id,
            'status' => WordPressInstall::FINISHED,
            'params' => ['dir' => '', 'url' => 'https://site1.example.com'],
        ]);

        Http::fake([
// Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/site1.example.com/public_html',
                ]],
            ]]),
// Engine: core/app/Http/Controllers/User/FileController.php:709
            'engine.example.com/api/projects/site1/files/download*' => Http::response('root debug line'),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:55 (`Api.get('/instances/{id}/wordpress/logs')`)
        // CA reads: packages/client-area/src/router/fetchData.js:56 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/logs")
            ->assertOk()
            ->assertJsonPath('data', 'root debug line');

        Http::assertSent(fn ($r) => str_contains($r->url(), 'files/download')
            && $r['path'] === 'site1.example.com/public_html/wp-content/debug.log');
    }

    public function test_a_missing_debug_log_is_empty_and_not_reported(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // A missing debug.log is the normal state (Engine files/download 404,
        // WP_DEBUG_LOG off); FilesApi::readFile must not report it – only a real
        // failure is logged.
        Http::fake([
// Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
// Engine: core/app/Http/Controllers/User/FileController.php:709
            'engine.example.com/api/projects/site1/files/download*' => Http::response(['message' => 'not found'], 404),
        ]);

        Exceptions::fake();

        // CA: packages/client-area/src/router/fetchData.js:55 (`Api.get('/instances/{id}/wordpress/logs')`)
        // CA reads: packages/client-area/src/router/fetchData.js:56 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/logs")
            ->assertOk()
            ->assertJsonPath('data', '');

        Exceptions::assertNothingReported();
    }

    public function test_wordpress_log_surfaces_an_unreachable_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // FilesApi::readFile reports and rethrows a real failure:
        // an Engine-down read must reach the CA as 503, not as an empty log.
        Http::fake([
// Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
            'engine.example.com/api/projects/site1/files/download*' => fn () => throw new \Illuminate\Http\Client\ConnectionException('down'),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:55 (`Api.get('/instances/{id}/wordpress/logs')`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/logs")
            ->assertStatus(503);
    }

    /**
     * Every log route, in both the /projects form and the /instances form the
     * CA builds by hand for downloads.
     *
     * @return array<string, array{string}>
     */
    public static function logRouteUris(): array
    {
        return [
            'webserver list' => ['/api/projects/{id}/webserver-logs'],
            'webserver show' => ['/api/projects/{id}/webserver-logs/access.log'],
            'webserver download' => ['/api/projects/{id}/webserver-logs/access.log/download'],
            'instances webserver download' => ['/api/instances/{id}/webserver-logs/access.log/download'],
            'php list' => ['/api/projects/{id}/php-logs'],
            'php download' => ['/api/projects/{id}/php-logs/download'],
            'instances php download' => ['/api/instances/{id}/php-logs/download'],
            'wordpress list' => ['/api/projects/{id}/wordpress/logs'],
            'wordpress download' => ['/api/projects/{id}/wordpress/logs/download'],
            'instances wordpress download' => ['/api/instances/{id}/wordpress/logs/download'],
        ];
    }

    #[DataProvider('logRouteUris')]
    public function test_a_log_route_requires_authentication(string $uri): void
    {
        // CA: packages/client-area/src/router/fetchData.js:29 (`Api.get('/instances/{id}/webserver-logs')`)
        $this->getJson(str_replace('{id}', '1', $uri))->assertUnauthorized();
    }

    #[DataProvider('logRouteUris')]
    public function test_a_log_route_answers_404_for_an_unknown_application(string $uri): void
    {
        $user = User::factory()->create();
        // The single user does own a project; the binding must still hide a
        // different id.
        $application = $this->application($user);

        // CA: packages/client-area/src/router/fetchData.js:29 (a project id the CA no longer has)
        $this->actingAs($user)
            ->getJson(str_replace('{id}', (string) ($application->id + 999), $uri))
            ->assertNotFound();
    }

    public function test_webserver_log_list_surfaces_a_down_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:36
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/router/fetchData.js:29 (`Api.get('/instances/{id}/webserver-logs')`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs")
            ->assertStatus(503);
    }

    public function test_webserver_log_show_surfaces_a_down_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/router/fetchData.js:42 (`Api.get('/instances/{id}/webserver-logs/{file}')`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log")
            ->assertStatus(503);
    }

    public function test_php_log_list_surfaces_a_down_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/PhpController.php:97
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/router/fetchData.js:68 (`Api.get('/instances/{id}/php-logs')`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs")
            ->assertStatus(503);
    }

    public function test_webserver_log_download_streams_the_file(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
        Http::fake(['engine.example.com/api/projects/site1/domains/site1.example.com/log-files/access.log*' => Http::response('webserver log body')]);

        // CA: packages/client-area/src/router/fetchData.js:42 (the CA builds this URL by hand -> /instances)
        $response = $this->actingAs($user)
            ->get("/api/instances/{$application->id}/webserver-logs/access.log/download")
            ->assertOk();

        $this->assertSame('webserver log body', $response->streamedContent());
    }

    public function test_webserver_log_download_surfaces_a_down_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/router/fetchData.js:42 (the /instances download URL)
        $this->actingAs($user)
            ->get("/api/instances/{$application->id}/webserver-logs/access.log/download")
            ->assertStatus(503);
    }

    public function test_php_log_download_carries_the_engine_php_error_log(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/PhpController.php:97 -> errorLog; core/app/Lib/Project/PhpErrorLog.php:126 (classic)
        Http::fake(['engine.example.com/api/projects/site1/php/error-log*' => Http::response(['data' => [
            'lines' => ['php error one', 'php error two'],
            'file' => 'php_error.log',
            'size' => 28,
            'mtime' => 1760349601,
            'truncated' => false,
        ]])]);

        // CA: packages/client-area/src/views/instance/advanced/Logs.vue:634 (the /instances download URL)
        $response = $this->actingAs($user)
            ->get("/api/instances/{$application->id}/php-logs/download")
            ->assertOk()
            ->assertDownload('php_error.log');

        $this->assertSame("php error one\nphp error two\n", $response->streamedContent());
        // The download asks for the Engine's maximum, 5000 lines.
        Http::assertSent(fn ($r) => str_contains($r->url(), '/projects/site1/php/error-log')
            && $r['lines'] === 5000);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/log-files'));
    }

    public function test_php_log_download_surfaces_a_down_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/PhpController.php:97
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/router/fetchData.js:68 (the /instances download URL)
        $this->actingAs($user)
            ->get("/api/instances/{$application->id}/php-logs/download")
            ->assertStatus(503);
    }

    public function test_wordpress_log_download_streams_the_debug_log(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/site1.example.com/public_html',
                ]],
            ]]),
            // Engine: core/app/Http/Controllers/User/FileController.php:709
            'engine.example.com/api/projects/site1/files/download*' => Http::response('wp debug body'),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:55 (the /instances download URL)
        $response = $this->actingAs($user)
            ->get("/api/instances/{$application->id}/wordpress/logs/download")
            ->assertOk();

        $this->assertSame('wp debug body', $response->streamedContent());
    }

    public function test_wordpress_log_download_surfaces_a_down_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/router/fetchData.js:55 (the /instances download URL)
        $this->actingAs($user)
            ->get("/api/instances/{$application->id}/wordpress/logs/download")
            ->assertStatus(503);
    }

    public function test_wordpress_log_download_surfaces_an_engine_5xx(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // A 5xx is an EngineRequestException, not an unreachable Engine, so the
        // 404-only guard in openWordpressLogStream must rethrow it.
        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => []],
            ]]),
            // Engine: core/app/Http/Controllers/Controller.php:21 (the Engine's error body)
            'engine.example.com/api/projects/site1/files/download*' => Http::response(['message' => 'boom'], 500),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:55 (the /instances download URL)
        $this->actingAs($user)
            ->get("/api/instances/{$application->id}/wordpress/logs/download")
            ->assertStatus(502);
    }

    /**
     * A suffix `Range: bytes=-51200` on a 1 KB file makes the
     * Engine answer 416; the reader re-reads without a Range header and takes
     * the tail locally.
     */
    public function test_a_416_webserver_log_tail_falls_back_to_a_plain_read(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $body = str_repeat('a', 1024);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
            'engine.example.com/api/projects/site1/domains/*/log-files/access.log*' => function ($request) use ($body) {
                if ($request->hasHeader('Range')) {
                    // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
                    return Http::response('', 416, ['Content-Range' => 'bytes */1024']);
                }

                // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
                return Http::response($body);
            },
        ]);

        // CA: packages/client-area/src/router/fetchData.js:42
        // CA reads: packages/client-area/src/router/fetchData.js:43
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log")
            ->assertOk()
            ->assertJsonPath('data', $body);

        Http::assertSent(fn ($r) => str_contains($r->url(), '/log-files/access.log') && $r->hasHeader('Range', 'bytes=-51200'));
        Http::assertSent(fn ($r) => str_contains($r->url(), '/log-files/access.log') && ! $r->hasHeader('Range'));
    }

    public function test_a_416_wordpress_debug_log_tail_falls_back_to_a_plain_read(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $body = str_repeat('d', 1024);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/site1.example.com/public_html',
                ]],
            ]]),
            // Engine: core/app/Http/Controllers/User/FileController.php:709
            'engine.example.com/api/projects/site1/files/download*' => function ($request) use ($body) {
                if ($request->hasHeader('Range')) {
                    // Engine: core/app/Http/Controllers/User/FileController.php:709
                    return Http::response('', 416, ['Content-Range' => 'bytes */1024']);
                }

                // Engine: core/app/Http/Controllers/User/FileController.php:709
                return Http::response($body);
            },
        ]);

        // CA: packages/client-area/src/router/fetchData.js:55
        // CA reads: packages/client-area/src/router/fetchData.js:56
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/logs")
            ->assertOk()
            ->assertJsonPath('data', $body);

        Http::assertSent(fn ($r) => str_contains($r->url(), 'files/download') && $r->hasHeader('Range', 'bytes=-102400'));
        Http::assertSent(fn ($r) => str_contains($r->url(), 'files/download') && ! $r->hasHeader('Range'));
    }

    public function test_a_416_debug_log_fallback_returns_the_last_preview_bytes(): void
    {
        // The fallback re-reads without a Range and must return
        // the tail locally, not the first bytes the read happened to buffer.
        // A file between 50 KB and 100 KB triggers the 416 (range 102400) and
        // is larger than the preview cap (51200) the caller wants back.
        $user = User::factory()->create();
        $application = $this->application($user);

        $body = str_repeat('a', 51200).str_repeat('b', 8800);
        $expected = substr($body, -51200);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/DomainController.php:46
            'engine.example.com/api/projects/site1/domains' => Http::response(['data' => [
                ['id' => 1, 'domain' => 'site1.example.com', 'type' => 'main', 'details' => [
                    'document_root' => '/site1.example.com/public_html',
                ]],
            ]]),
            // Engine: core/app/Http/Controllers/User/FileController.php:709
            'engine.example.com/api/projects/site1/files/download*' => function ($request) use ($body) {
                if ($request->hasHeader('Range')) {
                    // Engine: core/app/Http/Controllers/User/FileController.php:709
                    return Http::response('', 416, ['Content-Range' => 'bytes */60000']);
                }

                // Engine: core/app/Http/Controllers/User/FileController.php:709
                return Http::response($body);
            },
        ]);

        // CA: packages/client-area/src/router/fetchData.js:55
        // CA reads: packages/client-area/src/router/fetchData.js:56
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/wordpress/logs")
            ->assertOk()
            ->assertJsonPath('data', $expected);
    }

    public function test_the_webserver_log_route_answers_data_for_a_1kb_file(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $body = str_repeat('p', 1024);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:36
            'engine.example.com/api/projects/site1/domains/*/log-files?*' => Http::response(['data' => [
                ['file' => 'access.log', 'path' => '/x', 'mtime' => 1, 'size' => 1024],
            ]]),
            // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
            'engine.example.com/api/projects/site1/domains/*/log-files/*' => function ($request) use ($body) {
                if ($request->hasHeader('Range')) {
                    // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
                    return Http::response('', 416, ['Content-Range' => 'bytes */1024']);
                }

                // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
                return Http::response($body);
            },
        ]);

        // CA: packages/client-area/src/router/fetchData.js:42
        // CA reads: packages/client-area/src/router/fetchData.js:43
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log")
            ->assertOk()
            ->assertJsonPath('data', $body);
    }

    /**
     * $count lines of 100 bytes each (`0000---…`, 99 characters and `\n`).
     *
     * @return list<string>
     */
    private function hundredByteLines(int $count): array
    {
        return array_map(static fn (int $i): string => sprintf('%04d', $i).str_repeat('-', 95), range(0, $count - 1));
    }

    /**
     * The Engine's list holding `access.log` with $listedSize, and the file:
     * `Range: bytes=a-b` answers those bytes of $body (206), a range starting
     * past the end 416, as the Engine's `BinaryFileResponse` does.
     */
    private function fakeRangedLogFile(string $body, int $listedSize): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:36
            'engine.example.com/api/projects/site1/domains/*/log-files?*' => Http::response(['data' => [
                ['file' => 'access.log', 'path' => '/x/access.log', 'mtime' => 1, 'size' => $listedSize],
            ]]),
            // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
            'engine.example.com/api/projects/site1/domains/*/log-files/access.log*' => function ($request) use ($body) {
                $size = strlen($body);
                if (! preg_match('/^bytes=(\d+)-(\d+)$/', (string) ($request->header('Range')[0] ?? ''), $m)) {
                    // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
                    return Http::response($body);
                }

                $first = (int) $m[1];
                $last = min((int) $m[2], $size - 1);
                if ($first >= $size) {
                    // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
                    return Http::response('', 416, ['Content-Range' => 'bytes */'.$size]);
                }

                // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
                return Http::response(substr($body, $first, $last - $first + 1), 206, ['Content-Range' => "bytes {$first}-{$last}/{$size}"]);
            },
        ]);
    }

    public function test_webserver_log_page_one_is_the_newest_window_cut_to_lines(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $lines = $this->hundredByteLines(400);
        $this->fakeRangedLogFile(implode("\n", $lines)."\n", 40000);

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page` is sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log?page=1")
            ->assertOk();

        // CA reads: packages/client-area/src/router/fetchData.js:43 (the `data` envelope; its page keys are client-area-next's)
        $response->assertJsonPath('data.page', 1)
            ->assertJsonPath('data.pages', 3)
            ->assertJsonPath('data.size', 40000)
            ->assertJsonPath('data.window', 16384)
            // Page 1 is [23616, 40000): lines 237..399; the one at 23600 belongs to page 2.
            ->assertJsonPath('data.lines', array_slice($lines, 237));

        // One byte before the window, nothing past the file's end.
        Http::assertSent(fn ($r) => str_contains($r->url(), '/log-files/access.log')
            && $r->hasHeader('Range', 'bytes=23615-39999'));
    }

    public function test_webserver_log_page_two_keeps_the_snapshot_size_page_one_answered(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The file grew by one line after page 1 answered `size: 40000`.
        $lines = $this->hundredByteLines(401);
        $this->fakeRangedLogFile(implode("\n", $lines)."\n", 40100);

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page`/`size` are sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log?page=2&size=40000")
            ->assertOk();

        // CA reads: packages/client-area/src/router/fetchData.js:43 (the `data` envelope; its page keys are client-area-next's)
        $response->assertJsonPath('data.page', 2)
            ->assertJsonPath('data.pages', 3)
            ->assertJsonPath('data.size', 40000)
            // Page 2 is [7232, 23616): lines 73..236, the last completed past the window end.
            ->assertJsonPath('data.lines', array_slice($lines, 73, 164));

        // Window end 23616 - 1 + the 8192 bytes that complete the last line.
        Http::assertSent(fn ($r) => str_contains($r->url(), '/log-files/access.log')
            && $r->hasHeader('Range', 'bytes=7231-31807'));
    }

    public function test_webserver_log_page_one_with_a_snapshot_leaves_newer_lines_out(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $lines = $this->hundredByteLines(401);
        $this->fakeRangedLogFile(implode("\n", $lines)."\n", 40100);

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page`/`size` are sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log?page=1&size=40000")
            ->assertOk();

        // CA reads: packages/client-area/src/router/fetchData.js:43 (the `data` envelope; its page keys are client-area-next's)
        $response->assertJsonPath('data.size', 40000)
            ->assertJsonPath('data.lines', array_slice($lines, 237, 163));

        Http::assertSent(fn ($r) => str_contains($r->url(), '/log-files/access.log')
            && $r->hasHeader('Range', 'bytes=23615-40099'));
    }

    public function test_webserver_log_page_of_an_empty_file_has_no_lines_and_reads_nothing(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeRangedLogFile('', 0);

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page` is sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log?page=1")
            ->assertOk();

        // CA reads: packages/client-area/src/router/fetchData.js:43 (the `data` envelope; its page keys are client-area-next's)
        $response->assertExactJson(['data' => ['lines' => [], 'page' => 1, 'pages' => 1, 'size' => 0, 'window' => 16384]]);

        // A Range on an empty file would be a 416.
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/log-files/access.log'));
    }

    public function test_webserver_log_page_replaces_invalid_utf8(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeRangedLogFile("ok\nbad \xC3\x28 byte\n", 15);

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page` is sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log?page=1")
            ->assertOk();

        // CA reads: packages/client-area/src/router/fetchData.js:43 (the `data` envelope; its page keys are client-area-next's)
        $response->assertJsonPath('data.lines', ['ok', 'bad ?( byte']);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function invalidPageQueries(): array
    {
        return [
            'page zero' => ['page=0', 'page'],
            'page not a number' => ['page=abc', 'page'],
            'negative size' => ['page=1&size=-1', 'size'],
            'size not a number' => ['page=1&size=abc', 'size'],
        ];
    }

    #[DataProvider('invalidPageQueries')]
    public function test_webserver_log_page_validates_its_query(string $query, string $field): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->configureEngine();

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page`/`size` are sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log?{$query}")
            ->assertUnprocessable();

        // CA reads: packages/client-area/src/router/fetchData.js:49 (`Api.getErrorMessage(error)`)
        $response->assertJsonValidationErrors($field);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/log-files'));
    }

    public function test_webserver_log_page_past_the_last_page_is_a_422(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeRangedLogFile(str_repeat("x\n", 20000), 40000);

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page` is sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log?page=4")
            ->assertUnprocessable();

        // CA reads: packages/client-area/src/router/fetchData.js:49 (`Api.getErrorMessage(error)`)
        $response->assertJsonValidationErrors('page');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/log-files/access.log'));
    }

    public function test_webserver_log_page_after_an_engine_416_is_a_409(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The list still says 40000 bytes; the file was rotated to 1000 since.
        $this->fakeRangedLogFile(str_repeat(str_repeat('r', 99)."\n", 10), 40000);

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page` is sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log?page=1")
            ->assertStatus(409);

        // CA reads: packages/client-area/src/router/fetchData.js:49 (`Api.getErrorMessage(error)`)
        $response->assertJsonPath('message', 'The log file changed while it was read. Load the first page again.');

        Http::assertSent(fn ($r) => str_contains($r->url(), '/log-files/access.log')
            && $r->hasHeader('Range', 'bytes=23615-39999'));
    }

    public function test_webserver_log_page_of_a_file_the_list_does_not_hold_is_a_404(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeRangedLogFile("line\n", 5);

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page` is sent only by client-area-next)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/error.log?page=1")
            ->assertNotFound();

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/log-files/error.log'));
    }

    public function test_webserver_log_page_requires_authentication(): void
    {
        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page` is sent only by client-area-next)
        $this->getJson('/api/projects/1/webserver-logs/access.log?page=1')->assertUnauthorized();
    }

    public function test_webserver_log_page_answers_404_for_an_unknown_application(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page` is sent only by client-area-next)
        $this->actingAs($user)
            ->getJson('/api/projects/'.($application->id + 999).'/webserver-logs/access.log?page=1')
            ->assertNotFound();
    }

    public function test_webserver_log_page_requires_the_webserver_logs_privilege(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->denyPrivilege('general.view_webserver_logs');

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page` is sent only by client-area-next)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log?page=1")
            ->assertForbidden();
    }

    public function test_webserver_log_page_surfaces_a_down_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:36
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page` is sent only by client-area-next)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log?page=1")
            ->assertStatus(503);
    }

    public function test_webserver_log_page_surfaces_an_engine_5xx_on_the_read(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:36
            'engine.example.com/api/projects/site1/domains/*/log-files?*' => Http::response(['data' => [
                ['file' => 'access.log', 'path' => '/x/access.log', 'mtime' => 1, 'size' => 100],
            ]]),
            // Engine: core/app/Http/Controllers/Controller.php:21 (the Engine's error body)
            'engine.example.com/api/projects/site1/domains/*/log-files/access.log*' => Http::response(['message' => 'boom'], 500),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:42 (same route; `page` is sent only by client-area-next)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log?page=1")
            ->assertStatus(502);
    }

    public function test_webserver_log_show_without_page_keeps_the_old_tail(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeRangedLogFile("line one\nline two\n", 18);

        // CA: packages/client-area/src/router/fetchData.js:42 (`Api.get('/instances/{id}/webserver-logs/{file}')`, no query)
        // CA reads: packages/client-area/src/router/fetchData.js:43 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/webserver-logs/access.log")
            ->assertOk()
            ->assertExactJson(['data' => "line one\nline two\n"]);

        // The old suffix Range, and no list call.
        Http::assertSent(fn ($r) => $r->hasHeader('Range', 'bytes=-51200'));
        Http::assertNotSent(fn ($r) => str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/log-files'));
    }

    /**
     * A classic project: the Engine's list holds `php_error.log` with
     * $listedSize, and the file answers `Range: bytes=a-b` of $body.
     */
    private function fakeClassicPhpLog(string $body, int $listedSize): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:36
            'engine.example.com/api/projects/site1/domains/*/log-files?*' => Http::response(['data' => [
                ['file' => 'access.log', 'path' => '/x/access.log', 'mtime' => 1, 'size' => 10],
                ['file' => 'php_error.log', 'path' => '/x/php_error.log', 'mtime' => 1, 'size' => $listedSize],
            ]]),
            // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
            'engine.example.com/api/projects/site1/domains/*/log-files/php_error.log*' => function ($request) use ($body) {
                $size = strlen($body);
                preg_match('/^bytes=(\d+)-(\d+)$/', (string) ($request->header('Range')[0] ?? ''), $m);
                $first = (int) ($m[1] ?? 0);
                $last = min((int) ($m[2] ?? $size - 1), $size - 1);
                if ($first >= $size) {
                    // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
                    return Http::response('', 416, ['Content-Range' => 'bytes */'.$size]);
                }

                // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:70
                return Http::response(substr($body, $first, $last - $first + 1), 206, ['Content-Range' => "bytes {$first}-{$last}/{$size}"]);
            },
        ]);
    }

    /**
     * A dind project: the list has no `php_error.log`; the Engine's PHP
     * error-log endpoint answers $lines.
     *
     * @param  list<string>  $lines
     */
    private function fakeDindPhpLog(array $lines): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:36
            'engine.example.com/api/projects/site1/domains/*/log-files?*' => Http::response(['data' => [
                ['file' => 'access.log', 'path' => '/x/access.log', 'mtime' => 1, 'size' => 10],
            ]]),
            // Engine: core/app/Http/Controllers/User/PhpController.php:97 -> errorLog; core/app/Lib/Project/PhpErrorLog.php:73 (dind: container output, file null)
            'engine.example.com/api/projects/site1/php/error-log*' => Http::response(['data' => [
                'lines' => $lines, 'file' => null, 'size' => null, 'mtime' => null, 'truncated' => false,
            ]]),
        ]);
    }

    public function test_php_log_page_of_a_classic_project_pages_the_php_error_file(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $lines = $this->hundredByteLines(400);
        $this->fakeClassicPhpLog(implode("\n", $lines)."\n", 40000);

        // CA: packages/client-area/src/router/fetchData.js:68 (same route; `page` is sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs?page=1")
            ->assertOk();

        // CA reads: packages/client-area/src/router/fetchData.js:69 (the `data` envelope; its page keys are client-area-next's)
        $response->assertJsonPath('data.page', 1)
            ->assertJsonPath('data.pages', 3)
            ->assertJsonPath('data.size', 40000)
            ->assertJsonPath('data.window', 16384)
            ->assertJsonPath('data.lines', array_slice($lines, 237));

        Http::assertSent(fn ($r) => str_contains($r->url(), '/log-files/php_error.log')
            && $r->hasHeader('Range', 'bytes=23615-39999'));
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/php/error-log'));
    }

    public function test_php_log_page_two_of_a_classic_project_keeps_the_snapshot_size(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $lines = $this->hundredByteLines(401);
        $this->fakeClassicPhpLog(implode("\n", $lines)."\n", 40100);

        // CA: packages/client-area/src/router/fetchData.js:68 (same route; `page`/`size` are sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs?page=2&size=40000")
            ->assertOk();

        // CA reads: packages/client-area/src/router/fetchData.js:69 (the `data` envelope; its page keys are client-area-next's)
        $response->assertJsonPath('data.size', 40000)
            ->assertJsonPath('data.lines', array_slice($lines, 73, 164));

        Http::assertSent(fn ($r) => str_contains($r->url(), '/log-files/php_error.log')
            && $r->hasHeader('Range', 'bytes=7231-31807'));
    }

    public function test_php_log_page_of_a_dind_project_is_the_engine_tail_as_one_page(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeDindPhpLog(['first', 'second', 'last']);

        // CA: packages/client-area/src/router/fetchData.js:68 (same route; `page` is sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs?page=1")
            ->assertOk();

        // CA reads: packages/client-area/src/router/fetchData.js:69 (the `data` envelope; its page keys are client-area-next's)
        $response->assertExactJson(['data' => ['lines' => ['first', 'second', 'last'], 'page' => 1, 'pages' => 1, 'size' => null, 'window' => 16384]]);

        Http::assertSent(fn ($r) => str_contains($r->url(), '/projects/site1/php/error-log')
            && str_contains($r->url(), 'lines=1000'));
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/log-files/php_error.log'));
    }

    public function test_php_log_page_two_of_a_dind_project_is_a_422(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeDindPhpLog(['only']);

        // CA: packages/client-area/src/router/fetchData.js:68 (same route; `page` is sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs?page=2")
            ->assertUnprocessable();

        // CA reads: packages/client-area/src/router/fetchData.js:74 (`Api.getErrorMessage(error)`)
        $response->assertJsonValidationErrors('page');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/php/error-log'));
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function invalidPhpPageQueries(): array
    {
        return self::invalidPageQueries();
    }

    #[DataProvider('invalidPhpPageQueries')]
    public function test_php_log_page_validates_its_query(string $query, string $field): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->configureEngine();

        // CA: packages/client-area/src/router/fetchData.js:68 (same route; `page`/`size` are sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs?{$query}")
            ->assertUnprocessable();

        // CA reads: packages/client-area/src/router/fetchData.js:74 (`Api.getErrorMessage(error)`)
        $response->assertJsonValidationErrors($field);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/log-files') || str_contains($r->url(), '/php/error-log'));
    }

    public function test_php_log_page_past_the_last_page_of_a_classic_project_is_a_422(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeClassicPhpLog(str_repeat("x\n", 20000), 40000);

        // CA: packages/client-area/src/router/fetchData.js:68 (same route; `page` is sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs?page=4")
            ->assertUnprocessable();

        // CA reads: packages/client-area/src/router/fetchData.js:74 (`Api.getErrorMessage(error)`)
        $response->assertJsonValidationErrors('page');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/log-files/php_error.log'));
    }

    public function test_php_log_page_after_an_engine_416_is_a_409(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The list still says 40000 bytes; the file was rotated to 1000 since.
        $this->fakeClassicPhpLog(str_repeat(str_repeat('r', 99)."\n", 10), 40000);

        // CA: packages/client-area/src/router/fetchData.js:68 (same route; `page` is sent only by client-area-next)
        $response = $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs?page=1")
            ->assertStatus(409);

        // CA reads: packages/client-area/src/router/fetchData.js:74 (`Api.getErrorMessage(error)`)
        $response->assertJsonPath('message', 'The log file changed while it was read. Load the first page again.');
    }

    public function test_php_log_without_page_keeps_the_old_string(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->fakeClassicPhpLog("never read\n", 11);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/PhpController.php:97 -> errorLog; core/app/Lib/Project/PhpErrorLog.php:126 (classic)
            'engine.example.com/api/projects/site1/php/error-log*' => Http::response(['data' => [
                'lines' => ['php error one', 'php error two'], 'file' => 'php_error.log', 'size' => 28, 'mtime' => 1, 'truncated' => false,
            ]]),
        ]);

        // CA: packages/client-area/src/router/fetchData.js:68 (`Api.get('/instances/{id}/php-logs')`, no query)
        // CA reads: packages/client-area/src/router/fetchData.js:69 (`response.data.data`)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs")
            ->assertOk()
            ->assertExactJson(['data' => "php error one\nphp error two\n"]);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/log-files'));
    }

    public function test_php_log_page_requires_authentication(): void
    {
        // CA: packages/client-area/src/router/fetchData.js:68 (same route; `page` is sent only by client-area-next)
        $this->getJson('/api/projects/1/php-logs?page=1')->assertUnauthorized();
    }

    public function test_php_log_page_answers_404_for_an_unknown_application(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: packages/client-area/src/router/fetchData.js:68 (same route; `page` is sent only by client-area-next)
        $this->actingAs($user)
            ->getJson('/api/projects/'.($application->id + 999).'/php-logs?page=1')
            ->assertNotFound();
    }

    public function test_php_log_page_requires_the_php_logs_privilege(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->denyPrivilege('general.view_php_logs');

        // CA: packages/client-area/src/router/fetchData.js:68 (same route; `page` is sent only by client-area-next)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs?page=1")
            ->assertForbidden();
    }

    public function test_php_log_page_surfaces_a_down_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Domain/LogFileController.php:36
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/router/fetchData.js:68 (same route; `page` is sent only by client-area-next)
        $this->actingAs($user)
            ->getJson("/api/projects/{$application->id}/php-logs?page=1")
            ->assertStatus(503);
    }

    public function test_logs_require_authentication(): void
    {
        // CA: packages/client-area/src/router/fetchData.js:29 (`Api.get('/instances/{id}/webserver-logs')`)
        $this->getJson('/api/projects/1/webserver-logs')->assertUnauthorized();
    }
}
