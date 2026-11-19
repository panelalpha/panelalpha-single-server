<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\VirtualService;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineHealth;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The per-endpoint matrix for every hosting and file-manager route (`packages/client-area/routes/hosting.php`):
 *
 *  - unauthenticated -> 401 (every route, reads included);
 *  - unknown / foreign application or unknown service -> 404;
 *  - Engine down -> 503 on a connection error, 502 on an Engine 5xx
 *    (`EngineRequestException::render`) for the Engine-calling
 *    routes whose answer the CA consumes without extra panel-side setup.
 *
 * The missing-privilege -> 403 matrix is **not** duplicated here: the generated
 * {@see \Tests\Feature\ClientArea\PrivilegeAssignmentTest} already runs
 * every `privilege:`-guarded route with `denyPrivilege(<its own privilege>)`
 * (and the service-level writes with their derived-application privilege).
 * The `throttle:outbound` 429s live in {@see OutboundThrottleTest} and
 * {@see ServiceDomainTest}; the panel-only routes (`GET ssl-offer`,
 * `GET services`, `…/instance-options`, `…/domains/validate|verify|resolve`)
 * never call the Engine, so a down Engine cannot change their answer.
 *
 * CA call sites (request body and the keys read) per route group:
 *   FTP/SFTP/cron      packages/client-area/src/views/hosting/Ftp.vue, Sftp.vue, Cron.vue
 *   domains/PHP/SSL    packages/client-area/src/views/hosting/Domains.vue, mixins/DomainsActionsMixin.js,
 *                      views/instance/advanced/DeveloperSettings*.vue, components/security/SslEditModal.vue,
 *                      views/instance/advanced/Security.vue, apis/Hosting.js
 *   file manager       packages/client-area/fm/src/http/{get,post}.js, fm/src/FileManager.vue
 *   metrics/usage      packages/client-area/src/views/hosting/{UsageCard,GraphsCard,Summary}.vue
 *   services/proxy     packages/client-area/src/apis/Hosting.js
 *
 * @see Engine core/routes/api.php:196-241 (ftp/sftp/mysql/cron/files), :206-224 (mysql), :462-466 (metrics)
 */
class HostingRouteMatrixTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    /**
     * Matrix keys of the routes client-area-legacy registers, named
     * `client-area-legacy.…`. The preview SSO and the probes (`ssl.detected`,
     * `services.domains.resolve`) moved on into the controller, so none is left.
     *
     * @var list<string>
     */
    private const LEGACY_ROUTES = [];

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user): Application
    {
        // CA: packages/client-area/src/apis/Instances.js:76 (the project list the CA loads first)
        return $this->syncedApplication($user);
    }

    /**
     * One case per registered hosting / file-manager route: method, URI
     * template, the binding the 404 case must break (`app` = {application} /
     * {accountId}, `service` = {service}, `none` = no binding) and the action.
     *
     * @return array<string, array{string, string, string, string}>
     */
    public static function hostingRoutes(): array
    {
        return [
            'file_manager.content' => ['GET', 'api/file-manager/content/{application}', 'app', 'content'],
            'file_manager.create_directory' => ['POST', 'api/file-manager/create-directory/{application}', 'app', 'createDirectory'],
            'file_manager.create_file' => ['POST', 'api/file-manager/create-file/{application}', 'app', 'createFile'],
            'file_manager.delete' => ['POST', 'api/file-manager/delete/{application}', 'app', 'delete'],
            'file_manager.download' => ['GET', 'api/file-manager/download/{application}', 'app', 'download'],
            'file_manager.initialize' => ['GET', 'api/file-manager/initialize/{application}', 'app', 'initialize'],
            'file_manager.paste' => ['POST', 'api/file-manager/paste/{application}', 'app', 'paste'],
            'file_manager.preview' => ['GET', 'api/file-manager/preview/{application}', 'app', 'preview'],
            'file_manager.rename' => ['POST', 'api/file-manager/rename/{application}', 'app', 'rename'],
            'file_manager.stream_file' => ['GET', 'api/file-manager/stream-file/{application}', 'app', 'streamFile'],
            'file_manager.thumbnails' => ['GET', 'api/file-manager/thumbnails/{application}', 'app', 'thumbnails'],
            'file_manager.unzip' => ['POST', 'api/file-manager/unzip/{application}', 'app', 'unzip'],
            'file_manager.update_file' => ['POST', 'api/file-manager/update-file/{application}', 'app', 'updateFile'],
            'file_manager.upload' => ['POST', 'api/file-manager/upload/{application}', 'app', 'upload'],
            'file_manager.zip' => ['POST', 'api/file-manager/zip/{application}', 'app', 'zip'],
            'cron.index' => ['GET', 'api/server-accounts/{application}/cron-jobs', 'app', 'cronJobs'],
            'cron.store' => ['POST', 'api/server-accounts/{application}/cron-jobs', 'app', 'createCronJob'],
            'cron.update' => ['PUT', 'api/server-accounts/{application}/cron-jobs/{hash}', 'app', 'updateCronJob'],
            'cron.destroy' => ['DELETE', 'api/server-accounts/{application}/cron-jobs/{hash}', 'app', 'deleteCronJob'],
            'domains.index' => ['GET', 'api/server-accounts/{application}/domains', 'app', 'index'],
            'domains.store' => ['POST', 'api/server-accounts/{application}/domains', 'app', 'store'],
            'domains.update' => ['PUT', 'api/server-accounts/{application}/domains/{domain}', 'app', 'update'],
            'domains.destroy' => ['DELETE', 'api/server-accounts/{application}/domains/{domain}', 'app', 'destroy'],
            'domains.php_settings.show' => ['GET', 'api/server-accounts/{application}/domains/{domain}/php-settings', 'app', 'phpSettings'],
            'domains.php_settings.update' => ['PUT', 'api/server-accounts/{application}/domains/{domain}/php-settings', 'app', 'setPhpSettings'],
            'domains.php_version.show' => ['GET', 'api/server-accounts/{application}/domains/{domain}/php-version', 'app', 'phpVersion'],
            'domains.php_version.update' => ['PUT', 'api/server-accounts/{application}/domains/{domain}/php-version', 'app', 'setPhpVersion'],
            'domains.set_as_primary' => ['PUT', 'api/server-accounts/{application}/domains/{domain}/set-as-primary', 'app', 'setAsPrimary'],
            'ftp.index' => ['GET', 'api/server-accounts/{application}/ftp-accounts', 'app', 'ftpAccounts'],
            'ftp.store' => ['POST', 'api/server-accounts/{application}/ftp-accounts', 'app', 'createFtpAccount'],
            'ftp.server_info' => ['GET', 'api/server-accounts/{application}/ftp-accounts/server-info', 'app', 'ftpServerInfo'],
            'ftp.update' => ['PUT', 'api/server-accounts/{application}/ftp-accounts/{user}', 'app', 'updateFtpAccount'],
            'ftp.destroy' => ['DELETE', 'api/server-accounts/{application}/ftp-accounts/{user}', 'app', 'deleteFtpAccount'],
            'mysql.databases.index' => ['GET', 'api/server-accounts/{application}/mysql/databases', 'app', 'databases'],
            'mysql.databases.store' => ['POST', 'api/server-accounts/{application}/mysql/databases', 'app', 'createDatabase'],
            'mysql.databases.destroy' => ['DELETE', 'api/server-accounts/{application}/mysql/databases/{name}', 'app', 'deleteDatabase'],
            'mysql.databases.rename' => ['PUT', 'api/server-accounts/{application}/mysql/databases/{name}/name', 'app', 'renameDatabase'],
            'mysql.phpmyadmin_sso' => ['POST', 'api/server-accounts/{application}/mysql/phpmyadmin-sso-url', 'app', 'phpmyadminSso'],
        'mysql.phpmyadmin_preview_sso' => ['POST', 'api/server-accounts/{application}/mysql/phpmyadmin-preview-sso-url', 'app', 'phpmyadminPreviewSso'],
            'mysql.privileges.show' => ['GET', 'api/server-accounts/{application}/mysql/privileges/{user}/{database}', 'app', 'privileges'],
            'mysql.privileges.update' => ['PUT', 'api/server-accounts/{application}/mysql/privileges/{user}/{database}', 'app', 'updatePrivileges'],
            'mysql.privileges.destroy' => ['DELETE', 'api/server-accounts/{application}/mysql/privileges/{user}/{database}', 'app', 'revokePrivileges'],
            'mysql.server_info' => ['GET', 'api/server-accounts/{application}/mysql/server-info', 'app', 'serverInfo'],
            'mysql.users.index' => ['GET', 'api/server-accounts/{application}/mysql/users', 'app', 'users'],
            'mysql.users.store' => ['POST', 'api/server-accounts/{application}/mysql/users', 'app', 'createUser'],
            'mysql.users.update' => ['PUT', 'api/server-accounts/{application}/mysql/users/{name}', 'app', 'updateUser'],
            'mysql.users.destroy' => ['DELETE', 'api/server-accounts/{application}/mysql/users/{name}', 'app', 'deleteUser'],
            'php.versions' => ['GET', 'api/server-accounts/{application}/php-versions', 'app', 'phpVersions'],
            'sftp.index' => ['GET', 'api/server-accounts/{application}/sftp-accounts', 'app', 'sftpAccounts'],
            'sftp.store' => ['POST', 'api/server-accounts/{application}/sftp-accounts', 'app', 'createSftpAccount'],
            'sftp.server_info' => ['GET', 'api/server-accounts/{application}/sftp-accounts/server-info', 'app', 'sftpServerInfo'],
            'sftp.disconnect_all' => ['POST', 'api/server-accounts/{application}/sftp-accounts/disconnect-all', 'app', 'disconnectAllSftpSessions'],
            'sftp.set_access_type' => ['POST', 'api/server-accounts/{application}/sftp-accounts/set-access-type', 'app', 'setSftpAccessType'],
            'sftp.update' => ['PUT', 'api/server-accounts/{application}/sftp-accounts/{user}', 'app', 'updateSftpAccount'],
            'sftp.destroy' => ['DELETE', 'api/server-accounts/{application}/sftp-accounts/{user}', 'app', 'deleteSftpAccount'],
            'ssl.detected' => ['GET', 'api/server-accounts/{application}/ssl/certificate/detected', 'app', 'detectedSslCert'],
            'ssl.installed' => ['GET', 'api/server-accounts/{application}/ssl/certificate/installed', 'app', 'installedSslCert'],
            'ssl.install' => ['PUT', 'api/server-accounts/{application}/ssl/certificates/install', 'app', 'installSslCert'],
            'ssl.remove' => ['DELETE', 'api/server-accounts/{application}/ssl/certificates/installed', 'app', 'removeSslCert'],
            'ssl.order' => ['POST', 'api/server-accounts/{application}/ssl/certificates/order', 'app', 'orderSslCert'],
            'ssl.retry' => ['POST', 'api/server-accounts/{application}/ssl/certificates/retry', 'app', 'orderSslCert'],
            'ssl.settings.show' => ['GET', 'api/server-accounts/{application}/ssl/settings/{domain}', 'app', 'sslSettings'],
            'ssl.settings.update' => ['PUT', 'api/server-accounts/{application}/ssl/settings/{domain}', 'app', 'setSslSettings'],
            'usage' => ['GET', 'api/server-accounts/{application}/usage', 'app', 'usage'],
            'env_file.show' => ['GET', 'api/server-accounts/{application}/{resourceSegment}/{instanceId}/env-file', 'app', 'show'],
            'env_file.update' => ['PUT', 'api/server-accounts/{application}/{resourceSegment}/{instanceId}/env-file', 'app', 'update'],
            'env_file.meta' => ['GET', 'api/server-accounts/{application}/{resourceSegment}/{instanceId}/env-file/meta', 'app', 'meta'],
            'metrics' => ['GET', 'api/server/metrics/{period}', 'none', 'metrics'],
            'services.index' => ['GET', 'api/services', 'none', 'index'],
            'ssl_offer' => ['GET', 'api/ssl-offer', 'none', 'sslOffer'],
            'services.containers.index' => ['GET', 'api/services/{service}/containers', 'service', 'containers'],
            'services.containers.action' => ['POST', 'api/services/{service}/containers/{accountId}/action', 'service', 'containerAction'],
            'services.containers.service_action' => ['POST', 'api/services/{service}/containers/{accountId}/{container}/action', 'service', 'serviceAction'],
            'services.containers.logs' => ['GET', 'api/services/{service}/containers/{accountId}/{container}/logs', 'service', 'containerLogs'],
            'services.domains.index' => ['GET', 'api/services/{service}/domains', 'service', 'index'],
            'services.domains.store' => ['POST', 'api/services/{service}/domains', 'service', 'store'],
            'services.domains.resolve' => ['GET', 'api/services/{service}/domains/resolve', 'service', 'resolve'],
            'services.domains.validate' => ['GET', 'api/services/{service}/domains/validate', 'service', 'validate'],
            'services.domains.verify' => ['GET', 'api/services/{service}/domains/verify', 'service', 'verify'],
            'services.instance_options' => ['GET', 'api/services/{service}/instance-options', 'service', 'instanceOptions'],
            'services.proxy_rules.index' => ['GET', 'api/services/{service}/proxy-rules', 'service', 'proxyRules'],
            'services.proxy_rules.store' => ['POST', 'api/services/{service}/proxy-rules', 'service', 'createProxyRule'],
            'services.proxy_rules.update' => ['PUT', 'api/services/{service}/proxy-rules/{ruleId}', 'service', 'updateProxyRule'],
            'services.proxy_rules.destroy' => ['DELETE', 'api/services/{service}/proxy-rules/{ruleId}', 'service', 'deleteProxyRule'],
        ];
    }

    #[DataProvider('hostingRoutes')]
    public function test_a_hosting_route_requires_authentication(string $method, string $uri, string $binding, string $action): void
    {
        // CA: packages/client-area/src/views/hosting/index.vue:1 (hosting routes are only reached behind the SPA session)
        $this->json($method, $this->uriFor($method, $uri, 1, VirtualService::ID), $this->bodyFor($action))->assertUnauthorized();
    }

    /**
     * The hosting routes with an application or service binding: only these can
     * answer 404 for an id the user does not see.
     *
     * @return array<string, array{string, string, string, string}>
     */
    public static function boundHostingRoutes(): array
    {
        return array_filter(self::hostingRoutes(), static fn (array $route): bool => $route[2] !== 'none');
    }

    #[DataProvider('boundHostingRoutes')]
    public function test_a_bound_hosting_route_answers_404_for_an_unknown_binding(string $method, string $uri, string $binding, string $action): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // CA: packages/client-area/src/apis/Instances.js:76 (a stale application / service id the CA no longer sees)
        $this->actingAs($user)
            ->json($method, $this->uriFor($method, $uri, 999999, 999999), $this->bodyFor($action))
            ->assertNotFound();
    }

    /**
     * Engine-calling hosting routes whose answer the CA consumes with no extra
     * panel-side setup, so a connection error -> 503 and an Engine 5xx -> 502.
     *
     * @return array<string, array{string, string, string}>
     */
    public static function engineCallingHostingRoutes(): array
    {
        $cases = [];
        foreach (self::hostingRoutes() as $name => [$method, $uri, , $action]) {
            if (! in_array($name, [
                'domains.index', 'domains.store', 'domains.update', 'domains.destroy',
                'domains.php_version.show', 'domains.php_version.update', 'domains.php_settings.show',
                'domains.php_settings.update', 'domains.set_as_primary',
                'ftp.index', 'ftp.store', 'ftp.update', 'ftp.destroy',
                'mysql.databases.index', 'mysql.server_info', 'mysql.databases.store', 'mysql.databases.destroy',
                'mysql.users.index', 'mysql.users.store', 'mysql.users.update', 'mysql.users.destroy',
                'mysql.privileges.show', 'mysql.privileges.update', 'mysql.privileges.destroy', 'mysql.phpmyadmin_sso',
                'mysql.phpmyadmin_preview_sso',
                'sftp.index', 'sftp.store', 'sftp.update', 'sftp.destroy', 'sftp.disconnect_all',
                'cron.index', 'cron.store', 'cron.update', 'cron.destroy',
                'usage', 'php.versions', 'ssl.detected', 'ssl.installed', 'ssl.install', 'ssl.order', 'ssl.retry',
                'ssl.remove',
                'ssl.settings.show', 'ssl.settings.update',
                'env_file.show',
                // `file_manager.content` is not here: a non-2xx listing answer
                // becomes the fm SPA's `danger` envelope
                // (FileManagerTest::test_a_non_2xx_listing_answer_becomes_the_danger_envelope).
                'file_manager.create_directory', 'file_manager.create_file', 'file_manager.delete',
                'file_manager.download', 'file_manager.paste', 'file_manager.rename',
                'file_manager.stream_file', 'file_manager.unzip', 'file_manager.zip',
                'services.domains.store',
                'services.proxy_rules.index', 'services.proxy_rules.store', 'services.proxy_rules.update',
                'services.proxy_rules.destroy', 'services.containers.action', 'services.containers.service_action',
                'metrics',
            ], true)) {
                continue;
            }

            $cases[$name] = [$method, $uri, $action];
        }

        return $cases;
    }

    #[DataProvider('engineCallingHostingRoutes')]
    public function test_an_engine_calling_hosting_route_answers_503_on_a_connection_error(string $method, string $uri, string $action): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/apis/Api.js:1 (the CA surfaces the error status through `Api.getErrorMessage`)
        $response = $this->actingAs($user)
            ->json($method, $this->uriFor($method, $uri, $application->id, VirtualService::ID), $this->bodyFor($action));

        $this->assertSame(503, $response->status(), "{$method} {$uri} did not answer 503 with the Engine down.");
    }

    #[DataProvider('engineCallingHostingRoutes')]
    public function test_an_engine_calling_hosting_route_answers_502_on_an_engine_5xx(string $method, string $uri, string $action): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:136 -> UserCollection (any Engine transport failure body)
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 500)]);

        // A 5xx is the Engine's fault, not the user's: `EngineRequestException`
        // renders it 502.
        // CA: packages/client-area/src/apis/Api.js:1 (the CA surfaces the error status through `Api.getErrorMessage`)
        $response = $this->actingAs($user)
            ->json($method, $this->uriFor($method, $uri, $application->id, VirtualService::ID), $this->bodyFor($action));

        $this->assertSame(502, $response->status(), "{$method} {$uri} did not answer 502 on an Engine 5xx.");
    }

    public function test_the_file_manager_uploads_answer_503_when_the_engine_is_down(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/fm/src/http/post.js:44 (`HTTP.post('api/file-manager/upload/...', data, config)`)
        // CA reads: packages/client-area/fm/src/FileManager.vue:157 (`result.status` / `result.message`)
        $this->actingAs($user)
            ->post("/api/file-manager/upload/{$application->id}", [
                'files' => [UploadedFile::fake()->create('notes.txt', 1)],
                'names' => ['notes.txt'],
            ], ['Accept' => 'application/json'])
            ->assertStatus(503);

        // CA: packages/client-area/fm/src/http/post.js:23 (`HTTP.post('api/file-manager/update-file/...', formData)`)
        // CA reads: packages/client-area/fm/src/FileManager.vue:157 (`result.status` / `result.message`)
        $this->actingAs($user)
            ->post("/api/file-manager/update-file/{$application->id}", [
                'name' => 'notes.txt',
                'file' => UploadedFile::fake()->create('notes.txt', 1),
            ], ['Accept' => 'application/json'])
            ->assertStatus(503);
    }

    public function test_the_file_manager_content_answers_503_when_the_engine_is_down(): void
    {
        // The non-2xx listing answer becomes the fm `danger`
        // envelope, but a transport failure (the Engine down) is neither a 4xx
        // nor a 5xx and must still answer 503. `content` was
        // dropped from `engineCallingHostingRoutes`, so this pins it directly.
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/fm/src/http/get.js:43
        // CA reads: packages/client-area/fm/src/FileManager.vue:157
        $this->actingAs($user)
            ->getJson("/api/file-manager/content/{$application->id}?disk=home&path=public_html")
            ->assertStatus(503);
    }

    /**
     * The projects of one Engine, synced in one answer, so a test can fan the
     * containers list out over several of them.
     *
     * @param  list<string>  $usernames
     */
    private function containerApplications(User $user, array $usernames): void
    {
        $this->configureEngine();
        $projects = [];
        foreach (array_values($usernames) as $index => $username) {
            $projects[] = $this->engineProject(10 + $index, $username, ['details' => ['template' => 'dind']]);
        }

        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => $projects])]);
        // CA: packages/client-area/src/apis/Instances.js:76 (the project list the CA loads first)
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
    }

    public function test_the_container_fan_out_read_stops_at_the_first_engine_timeout(): void
    {
        $user = User::factory()->create();
        $this->containerApplications($user, ['site1', 'site2', 'site3']);

        // A stub that throws records no request, so the fake counts its own calls.
        $calls = 0;
        Http::fake(['engine.example.com/api/projects/*/containers' => function () use (&$calls): never {
            $calls++;

            throw new ConnectionException('down');
        }]);

        // CA: packages/client-area/src/apis/Hosting.js:81 (`allContainers().list()`)
        $response = $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/containers')
            ->assertStatus(503);

        $this->assertSame(EngineText::SAFE_UNAVAILABLE, $response->json('message'));

        $this->assertSame(1, $calls, 'the list asked the Engine once, not once per project.');
    }

    public function test_the_container_fan_out_read_answers_503_when_the_engine_is_marked_down(): void
    {
        $user = User::factory()->create();
        $this->containerApplications($user, ['site1', 'site2']);

        app(EngineHealth::class)->open(EngineConnection::DEFAULT_ID);
        Http::fake();

        // CA: packages/client-area/src/apis/Hosting.js:81 (`allContainers().list()`)
        $response = $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/containers')
            ->assertStatus(503);

        $this->assertSame(EngineText::SAFE_UNAVAILABLE, $response->json('message'));
        Http::assertNothingSent();
    }

    public function test_the_container_fan_out_read_never_syncs_the_mirror(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        // The 15 s poll reads the mirror and never syncs.
        config(['client-area.sync_ttl' => 0]);
        Http::fake();

        // CA: packages/client-area/src/apis/Hosting.js:81 (`allContainers().list()`)
        // CA reads: packages/client-area/src/views/hosting/Containers.vue:719 (`response.data.data`)
        $this->actingAs($user)
            ->getJson('/api/services/'.VirtualService::ID.'/containers')
            ->assertOk()
            ->assertJsonStructure(['data']);

        Http::assertNothingSent();
    }

    public function test_the_matrix_provider_covers_every_registered_hosting_route(): void
    {
        $registered = [];
        foreach (Route::getRoutes() as $route) {
            $name = (string) $route->getName();
            if (! $this->isHostingRouteName($name)) {
                continue;
            }
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $registered[$name] = $method.' '.$route->uri();
            }
        }

        $matrix = [];
        foreach (self::hostingRoutes() as $name => [$method, $uri]) {
            $matrix[$this->providerName($name)] = $method.' '.$uri;
        }

        ksort($registered);
        ksort($matrix);
        $this->assertSame($registered, $matrix, 'A registered hosting route is missing from the matrix provider (or vice versa).');
    }

    private function isHostingRouteName(string $name): bool
    {
        foreach (['client-area.', 'client-area-legacy.'] as $package) {
            if (str_starts_with($name, $package.'hosting.') || str_starts_with($name, $package.'file_manager.')) {
                return true;
            }
        }

        return false;
    }

    /**
     * The provider key is the short name (without the `client-area.` or
     * `client-area-legacy.` prefix). The routes client-area-legacy owns are named
     * with its prefix.
     */
    private function providerName(string $short): string
    {
        $package = in_array($short, self::LEGACY_ROUTES, true) ? 'client-area-legacy' : 'client-area';
        if (str_starts_with($short, 'file_manager.')) {
            return $package.'.file_manager.'.substr($short, strlen('file_manager.'));
        }
        if (str_starts_with($short, 'services.')) {
            return $package.'.hosting.services.'.substr($short, strlen('services.'));
        }

        return $package.'.hosting.'.$short;
    }

    private function uriFor(string $method, string $template, int $applicationId, int $serviceId): string
    {
        $replacements = [
            '{application}' => (string) $applicationId,
            '{instanceId}' => (string) $applicationId,
            '{accountId}' => (string) $applicationId,
            '{service}' => (string) $serviceId,
            '{resourceSegment}' => 'instances',
            '{period}' => 'current',
            '{domain}' => 'shop.example.com',
            '{user}' => 'site1_wp',
            '{database}' => 'site1_wp',
            '{name}' => 'site1_wp',
            '{hash}' => 'abc123',
            '{container}' => 'web',
            '{ruleId}' => '1',
        ];

        $uri = '/'.strtr($template, $replacements);
        if (in_array($method, ['GET', 'DELETE'], true)) {
            $uri .= '?domain=site1.example.com&path='.urlencode('project/.env');
        }

        return $uri;
    }

    /**
     * A valid body for the mutations that reach the Engine (the reads and the
     * panel-only routes send none). Keyed by the route action; the ambiguous
     * `store`/`update` actions are disambiguated by the callers' provider name.
     *
     * @return array<array-key, mixed>
     */
    private function bodyFor(string $action): array
    {
        return match ($action) {
            // CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269 (`{domain, type}`)
            'store' => ['domain' => 'new.example.com', 'type' => 'addon'],
            // CA: packages/client-area/src/mixins/DomainsActionsMixin.js:391 (`{document_root, ...}`)
            // `domains.update` and `env_file.update` share the `update` action; each
            // route's FormRequest ignores the other route's keys.
            'update' => [
                'document_root' => '/site1.example.com/public_html',
                'path' => 'project/.env',
                'mode' => 'raw', 'contents' => 'APP_ENV=local', 'restart' => false,
            ],
            'setPhpVersion' => ['php_version' => '8.3'],
            // CA: packages/client-area/src/views/instance/advanced/DeveloperSettings/PhpSettingsModal.vue:319
            // (the CA posts its whole row list).
            'setPhpSettings' => [['directive' => 'memory_limit', 'value' => '512M']],
            'createFtpAccount' => ['user' => 'site1', 'domain' => 'site1.example.com', 'password' => 'Secret-Password1!'],
            'updateFtpAccount' => ['password' => 'New-Password1!'],
            'createDatabase' => ['name' => 'app'],
            // CA: packages/client-area/src/views/hosting/databases/databases.api.ts:59 (`{ data: { confirm: true } }`, the dialog's box)
            'deleteDatabase' => ['confirm' => true],
            'createUser' => ['name' => 'site1_app', 'password' => 'Str0ng!Passw0rd'],
            'updateUser' => ['password' => 'Str0ng!Passw0rd'],
            'updatePrivileges' => ['privileges' => 'SELECT,INSERT'],
            'createSftpAccount' => ['username' => 'alice', 'type' => 'password', 'password' => 'Str0ng!Passw0rd'],
            'updateSftpAccount' => ['type' => 'password', 'password' => 'Str0ng!Passw0rd'],
            'setSftpAccessType' => ['access_type' => 'ssh'],
            'installSslCert' => ['domain' => 'site1.example.com', 'certificate' => 'CERT', 'key' => 'KEY', 'cabundle' => 'CA'],
            'orderSslCert' => ['domain' => 'site1.example.com'],
            'setSslSettings' => ['force_https_redirect' => true],
            'updateCronJob', 'createCronJob' => ['command' => '/usr/bin/php cron.php', 'minute' => '0', 'hour' => '*', 'day_of_month' => '*', 'month' => '*', 'day_of_week' => '*'],
            'createDirectory', 'createFile' => ['name' => 'notes.txt', 'path' => 'project', 'disk' => 'home'],
            'delete' => ['items' => [['path' => 'project/notes.txt']], 'disk' => 'home'],
            'rename' => ['oldName' => 'notes.txt', 'newName' => 'readme.txt', 'path' => 'project', 'disk' => 'home'],
            'paste' => ['clipboard' => ['type' => 'copy', 'files' => ['project/notes.txt']], 'path' => 'project', 'disk' => 'home'],
            'zip' => ['name' => 'archive.zip', 'path' => 'project', 'elements' => ['files' => ['notes.txt']], 'disk' => 'home'],
            'unzip' => ['path' => 'project/archive.zip', 'disk' => 'home'],
            'containerAction', 'serviceAction' => ['action' => 'restart'],
            // CA: packages/client-area/src/apis/Hosting.js:62 (`{transport, listen_port, server_name, username, upstream_host, upstream_port}`)
            'createProxyRule', 'updateProxyRule' => [
                'transport' => 'http', 'listen_port' => 8080, 'server_name' => 'site1.example.com',
                'username' => 'site1', 'upstream_host' => 'site1', 'upstream_port' => 80,
            ],
            default => [],
        };
    }
}
