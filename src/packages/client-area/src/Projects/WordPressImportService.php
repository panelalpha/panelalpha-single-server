<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Events\ImportStatusChanged;
use PanelAlpha\ClientArea\Hosting\DomainValidation;
use PanelAlpha\ClientArea\Jobs\WordPress\StartWordPressImportJob;
use PanelAlpha\ClientArea\Jobs\WordPress\WatchWordPressImportJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressImport;
use PanelAlpha\ClientArea\Provisioning\ProvisionRequest;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\WordPressMigrationsApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;

/**
 * WordPress site import into a classic project (Engine 2.2.0 and later; the old
 * panel's methods except FTP). The Engine does the import (`/wordpress/migrations`); the panel keeps
 * the old Client Area flow (`OnboardingModalWrapper.vue:1680-1830`):
 *
 * 1. `test-wordpress-url` – is the URL a WordPress site? The Engine's
 *    connection test in the manual-plugin mode with a token no plugin holds
 *    reads the site's REST index and stops before any login: `plugin_not_found`
 *    or `unauthorized` mean WordPress, `not_wordpress` means not, anything else
 *    is the reason it could not be reached. The Engine fetches the URL, behind
 *    its own egress guard, so the panel makes no outbound request;
 * 2. `test-wordpress-connection` – the Engine test with the wp-admin login
 *    (`wp_admin`) or the plugin token the user downloaded (`manual_plugin`);
 * 3. `domain` – the classic project on the site's own domain (the URL's host
 *    without `www.`, the Engine's `MigrationTargetResolver::defaultDomain`),
 *    created like the onboarding domain step;
 * 4. `import` – records the start and queues {@see StartWordPressImportJob},
 *    which waits for the project's create task and starts the Engine import
 *    into that project (`project`; the site keeps its domain and URLs).
 */
final class WordPressImportService
{
    /** No plugin holds this token: the test stops at the plugin check. */
    public const string PROBE_TOKEN = '0000000000000000000000000000000000000000000000000000000000000000';

    /** FTP, FTPS and SFTP sources come later. */
    public const string FTP_NOT_AVAILABLE = 'Importing over FTP is not available. Use your WordPress admin login or the migration plugin.';

    /** Old `api/messages.cannot_connect_to_wordpress`. */
    public const string CANNOT_CONNECT = 'Cannot connect to WordPress. Please verify the URL or admin credentials. Alternatively, please install the plugin manually.';

    /** Old `api/messages.cannot_connect_to_wordpress_using_admin_credentials` (`connection_error`). */
    public const string ADMIN_LOGIN_BLOCKED = 'Using your WordPress admin credentials will not work (probably due to Cloudflare/firewall/WAF restrictions). Please install the plugin manually.';

    /** Old `api/messages.migrator_plugin_not_found`. */
    public const string PLUGIN_NOT_FOUND = 'Migration plugin not found in your WordPress.';

    public const string PLUGIN_FROM_ANOTHER_DOWNLOAD = 'The migration plugin on your WordPress comes from another download. Download the plugin again, install and activate it, then try again.';

    /** Old `api/custom_validation.cannot_generate_subdomain_for_instance`. */
    public const string NO_DOMAIN_FOR_IP = 'Cannot generate subdomain for imported instance';

    /**
     * The Engine's `domain_taken` speaks to an API caller ("Send another
     * `domain`"); the CA's import has no domain field, so the user is told why
     * instead (old `createDomain`: `domain_name_not_available`).
     */
    public const string DOMAIN_TAKEN = "This site's domain is already used by a project on this server.";

    public const string NOT_CLASSIC = 'A WordPress site is imported into a PHP hosting project; this project runs in its own containers.';

    public const string ALREADY_IMPORTING = 'A site is already imported or being imported into this project.';

    /** Old `api/custom_validation.cannot_retry_installation`. */
    public const string CANNOT_RETRY = 'Cannot retry installation on this instance.';

    public function __construct(
        private readonly EngineResolver $engines,
        private readonly ApplicationRepository $applications,
        private readonly ApplicationProvisioner $provisioner,
        private readonly DomainValidation $validation,
    ) {}

    /**
     * Old `testWordpressUrl` answer `{wordpress_detected, error_message}`.
     *
     * @return array{wordpress_detected: bool, error_message: string|null}
     */
    public function testUrl(string $url, ?string $ipAddress): array
    {
        $body = ['url' => $url, 'method' => WordPressImport::METHOD_MANUAL_PLUGIN, 'source_token' => self::PROBE_TOKEN];
        if ($ipAddress !== null && $ipAddress !== '') {
            $body['source_ip'] = $ipAddress;
        }

        try {
            $answer = $this->api()->test($body);
        } catch (EngineValidationException $e) {
            // The old detector turned every refusal into `error_message`.
            return ['wordpress_detected' => false, 'error_message' => EngineErrors::message($e)];
        }

        if (($answer['ok'] ?? null) === true) {
            return ['wordpress_detected' => true, 'error_message' => null];
        }

        return match (Payload::nullableString($answer['error_type'] ?? null)) {
            'plugin_not_found', 'unauthorized', 'login_failed' => ['wordpress_detected' => true, 'error_message' => null],
            'not_wordpress' => ['wordpress_detected' => false, 'error_message' => null],
            default => ['wordpress_detected' => false, 'error_message' => $this->answerMessage($answer, self::CANNOT_CONNECT)],
        };
    }

    /**
     * Old `testWordpressConnection` answer `{success, import_details,
     * error_type, message}`; `import_details` echoes the request but never
     * the password, with the site's own `url` and `login_url` from the
     * Engine, and the CA sends it back to `import/import`.
     *
     * @param  array<string, mixed>  $params  the validated ImportConnectionRequest
     * @return array{success: bool, import_details: array<string, mixed>, error_type: string|null, message: string|null}
     */
    public function testConnection(array $params, ImportPluginTokens $tokens): array
    {
        self::assertNotFtp($params);

        $response = ['success' => false, 'import_details' => self::echoedDetails($params), 'error_type' => null, 'message' => null];
        $admin = (bool) ($params['using_admin_login_credentials'] ?? false);
        $body = $this->sourceBody($params, $admin);

        $token = null;
        if ($admin) {
            $answer = $this->api()->test($body);
        } else {
            $answer = null;
            foreach ($tokens->all() as $candidate) {
                $token = $candidate;
                $answer = $this->api()->test($body + ['source_token' => $candidate]);
                if (($answer['error_type'] ?? null) !== 'unauthorized') {
                    break;
                }
            }
            if ($answer === null) {
                return ['error_type' => 'error', 'message' => self::PLUGIN_NOT_FOUND] + $response;
            }
        }

        if (($answer['ok'] ?? null) !== true) {
            [$type, $message] = $this->failure($answer, $admin);

            return ['error_type' => $type, 'message' => $message] + $response;
        }

        $siteUrl = Payload::nullableString($answer['url'] ?? null) ?? Payload::string($params['url'] ?? '');
        $response['import_details']['url'] = $siteUrl;
        $response['import_details']['login_url'] = Payload::nullableString($answer['login_url'] ?? null);
        if ($token !== null) {
            $tokens->verify($siteUrl, $token);
        }
        $response['success'] = true;

        return $response;
    }

    /**
     * The request as `import_details`: the password the client just sent is
     * never echoed back (it would end up in devtools, logs and error reports).
     *
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    private static function echoedDetails(array $params): array
    {
        unset($params['password']);

        return $params;
    }

    /**
     * The import's domain step (old `createDomain`): the classic project on the
     * site's own domain.
     *
     * @throws ValidationException an IP source, a domain in use
     */
    public function createDomain(Authenticatable $user, int $serviceId, string $url): Application
    {
        $host = strtolower(trim((string) parse_url($url, PHP_URL_HOST), '[].'));
        if ($host === '' || filter_var($host, FILTER_VALIDATE_IP) !== false) {
            throw ValidationException::withMessages([self::NO_DOMAIN_FOR_IP]);
        }
        $domain = str_starts_with($host, 'www.') ? substr($host, 4) : $host;

        $this->validation->assertAvailable($user, $domain);

        return $this->provisioner->provision($user, new ProvisionRequest(
            domain: $domain,
            serviceId: $serviceId,
        ))->application;
    }

    /**
     * Old `importWordpress`: record the import and queue its start.
     *
     * @param  array<string, mixed>  $params  the validated ImportStartRequest
     *
     * @throws ValidationException
     */
    public function start(Authenticatable $user, array $params, ImportPluginTokens $tokens): Application
    {
        self::assertNotFtp($params);

        $application = $this->applications->findForUser($user, Payload::int($params['domain_id'] ?? null) ?? 0);
        if ($application->isContainer()) {
            throw ValidationException::withMessages([self::NOT_CLASSIC]);
        }
        if ($application->wordpressImport !== null || $application->wordpressInstall !== null) {
            throw ValidationException::withMessages([self::ALREADY_IMPORTING]);
        }

        $admin = (bool) ($params['using_admin_login_credentials'] ?? false);
        $url = Payload::string($params['url'] ?? '');
        $source = $this->sourceBody($params, $admin);
        if (! $admin) {
            $token = $tokens->forUrl($url);
            if ($token === null) {
                throw ValidationException::withMessages([self::PLUGIN_NOT_FOUND]);
            }
            $source['source_token'] = $token;
        }

        $this->record($application, $url, $source);

        return $application;
    }

    /**
     * Record an import into a classic project and queue its start – the
     * Client Area's import and the Admin Area's bulk import.
     *
     * @param  array<string, string>  $source  the Engine start body without `project`
     */
    public function record(Application $application, string $url, array $source): void
    {
        WordPressImport::query()->create([
            'application_id' => $application->id,
            'method' => ($source['method'] ?? null) === WordPressImport::METHOD_WP_ADMIN ? WordPressImport::METHOD_WP_ADMIN : WordPressImport::METHOD_MANUAL_PLUGIN,
            'source_url' => $url,
            'status' => WordPressImport::STARTING,
            'source' => $source,
        ]);
        // The old import named the project after the source host.
        $host = Payload::nullableString(parse_url($url, PHP_URL_HOST));
        if ($host !== null && $host !== '') {
            $application->forceFill(['site_name' => $host])->save();
        }
        $application->unsetRelation('wordpressImport');

        StartWordPressImportJob::dispatch($application->id);
    }

    /**
     * The wp-admin start body for a source (the Admin Area's bulk import).
     *
     * @return array<string, string>
     */
    public function adminSource(string $url, string $username, string $password, ?string $loginUrl = null): array
    {
        return $this->sourceBody([
            'url' => $url,
            'login_url' => $loginUrl,
            'username' => $username,
            'password' => $password,
        ], true);
    }

    /**
     * The Engine connection test of a wp-admin source (the bulk import's
     * check): whether it passed, the site's own URL, else the reason in the old texts.
     *
     * @param  array<string, string>  $source  from {@see adminSource()}
     * @return array{ok: bool, url: string|null, error: string|null}
     */
    public function checkAdminSource(array $source): array
    {
        $answer = $this->api()->test($source);
        if (($answer['ok'] ?? null) === true) {
            return ['ok' => true, 'url' => Payload::nullableString($answer['url'] ?? null), 'error' => null];
        }

        return ['ok' => false, 'url' => null, 'error' => $this->failure($answer, true)[1]];
    }

    /**
     * Stop an unfinished import on the Engine (the Admin Area's "stop"): the
     * Engine removes what it imported and its preview. Best effort; false when
     * there is nothing to cancel.
     */
    public function cancel(Application $application): bool
    {
        $import = $application->wordpressImport;
        if ($import === null || $import->engine_migration_id === null || ! $import->isUnfinished()) {
            return false;
        }

        try {
            $answer = (new WordPressMigrationsApi($application->engine()))->cancel($import->engine_migration_id);
        } catch (EngineException $e) {
            report($e);

            return false;
        }
        $import->update([
            'status' => Payload::nullableString($answer['status'] ?? null) ?? WordPressImport::CANCELLING,
            'engine_status' => $answer,
        ]);

        return true;
    }

    /**
     * Old `quickRetryImportWordpress`: resume a failed (or dead) import on the
     * Engine, or start one the Engine refused again. False when there is
     * nothing to retry.
     */
    public function retry(Application $application): bool
    {
        $import = $application->wordpressImport;
        if ($import === null) {
            return false;
        }

        if ($import->engine_migration_id === null) {
            if ($import->status !== WordPressImport::FAILED || $import->source === null) {
                return false;
            }
            $import->update(['status' => WordPressImport::STARTING, 'error' => null]);
            StartWordPressImportJob::dispatch($application->id);

            return true;
        }

        if ($import->status !== WordPressImport::FAILED && ! $import->isStale()) {
            return false;
        }

        try {
            $answer = (new WordPressMigrationsApi($application->engine()))->resume($import->engine_migration_id);
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 409) {
                return false;
            }

            throw $e;
        }

        $import->update([
            'status' => Payload::nullableString($answer['status'] ?? null) ?? WordPressImport::PENDING,
            'engine_status' => $answer,
            'error' => null,
        ]);
        ImportStatusChanged::forEveryone($application->refresh());
        WatchWordPressImportJob::dispatch($application->id);

        return true;
    }

    /**
     * Before the project is deleted: an unfinished import is cancelled (the
     * Engine removes what it imported and its preview), an ended one's record
     * is deleted (it would keep the Engine's DNS-switch check visiting a gone
     * project). Best effort – the project delete goes on either way.
     */
    public function forget(Application $application): void
    {
        $import = $application->wordpressImport;
        if ($import === null || $import->engine_migration_id === null) {
            return;
        }

        $api = new WordPressMigrationsApi($application->engine());
        try {
            if ($import->isUnfinished()) {
                $api->cancel($import->engine_migration_id);
            } else {
                $api->delete($import->engine_migration_id);
            }
        } catch (EngineException $e) {
            report($e);
        }
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array<string, string>
     */
    private function sourceBody(array $params, bool $admin): array
    {
        $body = ['url' => Payload::string($params['url'] ?? '')];
        $ip = Payload::nullableString($params['ip_address'] ?? null);
        if ($ip !== null && $ip !== '') {
            $body['source_ip'] = $ip;
        }

        if (! $admin) {
            return $body + ['method' => WordPressImport::METHOD_MANUAL_PLUGIN];
        }

        $body['method'] = WordPressImport::METHOD_WP_ADMIN;
        // The CA pre-fills the field with a bare `https://` (old rule: any
        // string); only a usable URL narrows the Engine's login page search.
        $loginUrl = Payload::nullableString($params['login_url'] ?? null);
        if ($loginUrl !== null && filter_var($loginUrl, FILTER_VALIDATE_URL) !== false) {
            $body['login_url'] = $loginUrl;
        }
        $body['username'] = Payload::string($params['username'] ?? '');
        $body['password'] = Payload::string($params['password'] ?? '');

        return $body;
    }

    /**
     * The CA's `error_type` and text for a failed test: `connection_error`
     * makes the simple-method modal switch to the manual plugin
     * (`OnboardingImportSimpleMethodModal.vue:308-314`), which is the way past
     * a Cloudflare challenge on the login page; a wrong login stays an `error`
     * the user can correct.
     *
     * @param  array<string, mixed>  $answer
     * @return array{0: string, 1: string}
     */
    private function failure(array $answer, bool $admin): array
    {
        $type = Payload::nullableString($answer['error_type'] ?? null);

        // The target checks run after the source was found, for either method.
        if ($type === 'domain_taken') {
            return ['error', self::DOMAIN_TAKEN];
        }
        if ($type === 'domain_required') {
            return ['error', self::NO_DOMAIN_FOR_IP];
        }

        if ($admin) {
            return match ($type) {
                'cloudflare' => ['connection_error', self::ADMIN_LOGIN_BLOCKED],
                'login_failed' => ['error', self::CANNOT_CONNECT],
                default => ['error', $this->answerMessage($answer, self::CANNOT_CONNECT)],
            };
        }

        return match ($type) {
            'plugin_not_found' => ['error', self::PLUGIN_NOT_FOUND],
            'unauthorized' => ['error', self::PLUGIN_FROM_ANOTHER_DOWNLOAD],
            default => ['error', $this->answerMessage($answer, self::CANNOT_CONNECT)],
        };
    }

    /**
     * @param  array<string, mixed>  $answer
     */
    private function answerMessage(array $answer, string $fallback): string
    {
        $message = Payload::nullableString($answer['message'] ?? null);

        return $message === null || $message === '' ? $fallback : $message;
    }

    /**
     * @param  array<string, mixed>  $params
     *
     * @throws ValidationException
     */
    private static function assertNotFtp(array $params): void
    {
        if (($params['type'] ?? null) === 'ftp') {
            throw ValidationException::withMessages([self::FTP_NOT_AVAILABLE]);
        }
    }

    private function api(): WordPressMigrationsApi
    {
        return new WordPressMigrationsApi($this->engines->forEngine($this->engines->defaultEngineId()));
    }
}
