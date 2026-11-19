<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Sleep;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Contracts\PrimaryDomainSwitcher;
use PanelAlpha\ClientArea\Events\ProjectDomainCreated;
use PanelAlpha\ClientArea\Events\ProjectDomainDeleted;
use PanelAlpha\ClientArea\Events\SslCertificateInstalled;
use PanelAlpha\EngineClient\Api\AccountsApi;
use PanelAlpha\EngineClient\Api\ContainersApi;
use PanelAlpha\EngineClient\Api\DomainsApi;
use PanelAlpha\EngineClient\Api\MysqlApi;
use PanelAlpha\EngineClient\Api\SystemApi;
use PanelAlpha\EngineClient\Api\UsageApi;
use PanelAlpha\EngineClient\Api\WordPressApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\ClientArea\Http\Presenters\AccountPresenter;
use PanelAlpha\ClientArea\Http\Presenters\DomainPresenter;
use PanelAlpha\ClientArea\Http\Presenters\MysqlPresenter;
use PanelAlpha\ClientArea\Http\Presenters\SslCertificatePresenter;
use PanelAlpha\ClientArea\Http\Presenters\UsagePresenter;
use PanelAlpha\ClientArea\Jobs\WordPress\PointWordPressAtRenamedDatabaseJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\AddonDomain;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\ProtectedProject;
use Throwable;

/**
 * MySQL operations for one server account. The CA's
 * "server account" is the Engine project in single-server mode, so the
 * {application} route binding resolves it – this service only orchestrates
 * Engine calls and shaping.
 */
final class ServerAccountService
{
    public function __construct(
        private readonly MysqlPresenter $presenter,
        private readonly AccountPresenter $accounts,
        private readonly DomainPresenter $domains,
        private readonly UsagePresenter $usagePresenter,
        private readonly SslCertificatePresenter $certificates,
        private readonly ApplicationRepository $applications,
        private readonly PrimaryDomainSwitcher $domainSwitcher,
    ) {}

    /**
     * @return array{data: list<array<string, mixed>>, meta: array{actions: array{rename: bool}}}
     */
    public function databases(Application $application): array
    {
        $databases = (new MysqlApi($application->engine()))->databases($application->engineProject());

        return [
            'data' => $this->presenter->databases($databases),
            // The Engine renames databases (since Engine `29ae`) and, since
            // Engine 2.2.0, the panel points a WordPress install's DB_NAME at
            // the new name; only a not-yet-detected project is refused.
            'meta' => ['actions' => ['rename' => $application->type !== null]],
        ];
    }

    public function createDatabase(Application $application, string $name): void
    {
        (new MysqlApi($application->engine()))->createDatabase($application->engineProject(), $name);
    }

    public function deleteDatabase(Application $application, string $name): void
    {
        (new MysqlApi($application->engine()))->deleteDatabase($application->engineProject(), $name);
    }

    /**
     * Rename one database (since Engine `29ae`). The
     * Engine renames asynchronously (`202 + TaskResource`,
     * `core/app/Http/Controllers/User/Mysql/DatabaseController.php:247`); the old
     * panel's rename was synchronous and the CA reloads the list immediately
     * after the response (`views/hosting/Databases.vue:797`), so the panel follows
     * the task here instead of leaving the list stale.
     *
     * The Engine does not rewrite `wp-config.php`. For the database a WordPress
     * install uses (its `DB_NAME`), the panel sets `DB_NAME` to the new name with
     * the dedicated `PUT wp/config/DB_NAME` once the rename completed (Engine
     * 2.2.0; until then refused) – after the request when
     * the rename outlasts it ({@see PointWordPressAtRenamedDatabaseJob}).
     * Undetected projects (`type = null`) fail closed: the rename must know
     * whether a `DB_NAME` follows it.
     */
    public function renameDatabase(Application $application, string $name, string $newName): void
    {
        if ($application->type === null) {
            throw ValidationException::withMessages([self::DATABASE_RENAME_UNKNOWN_REFUSAL]);
        }

        // Read before the rename: afterwards a failed read could not tell
        // whether the install still needs its DB_NAME moved.
        $wordPressDatabase = $application->type === Application::TYPE_WORDPRESS
            ? $this->wordPressDatabaseName($application)
            : null;

        $engine = $application->engine();

        try {
            $response = (new MysqlApi($engine))->renameDatabase($application->engineProject(), $name, $newName);
        } catch (EngineRequestException $e) {
            // A project whose Engine create task is still running answers a busy
            // 409 that does not say it is still being prepared; keep the 409
            // (the old status) and give the CA the reason.
            if ($e->engineStatus === 409 && $application->status === 'pending') {
                throw new EngineRequestException(409, EngineText::STILL_PREPARING);
            }

            throw $e;
        }

        $taskId = Payload::int($response->json('data.id'));
        if ($taskId === null || $taskId <= 0) {
            // The Engine always answers 202 with a task; a 2xx without one is
            // malformed, so the rename is not proven.
            throw new EngineRequestException(200, 'The Engine did not return a task for the database rename.');
        }

        $completed = $this->waitForRenameTask($engine, $taskId);

        // The task carries the prefixed names (`DatabaseController::rename`).
        $details = Payload::object($response->json('data.details'));
        $from = Payload::nullableString($details['from'] ?? null);
        $to = Payload::nullableString($details['to'] ?? null);
        if ($wordPressDatabase === null || $from === null || $to === null || $wordPressDatabase !== $from) {
            return;
        }

        if (! $completed) {
            PointWordPressAtRenamedDatabaseJob::dispatch($application->id, $taskId, $to);

            return;
        }

        self::pointWordPressAt($application, $to);
    }

    /**
     * Set the WordPress install's `DB_NAME` to the renamed database (a string
     * constant, `PUT wp/config/{constant}`, Engine `WpConfigSetRequest`).
     */
    public static function pointWordPressAt(Application $application, string $database): void
    {
        (new WordPressApi($application->engine(), $application->wordpressInstallPath()))->setConfig($application->engineProject(), 'DB_NAME', [
            'value' => $database,
            'type' => 'constant',
        ]);
    }

    /**
     * The WordPress install's `DB_NAME` (one `GET wp/config` list), or null when
     * it has none.
     */
    private function wordPressDatabaseName(Application $application): ?string
    {
        foreach (Payload::objects((new WordPressApi($application->engine(), $application->wordpressInstallPath()))->config($application->engineProject())) as $row) {
            if (Payload::nullableString($row['name'] ?? null) === 'DB_NAME') {
                return Payload::nullableString($row['value'] ?? null);
            }
        }

        return null;
    }

    /**
     * Follow the Engine rename task so the CA's immediate reload sees the new
     * name. Polls at a pinned 3 s; a connect/5xx hiccup stops
     * the wait and leaves the queued rename; a
     * failed/cancelled task answers the Engine message as the old key-0 422.
     * Reaching the budget also returns (the rename is already queued Engine-side).
     *
     * @return bool whether the task completed within the wait
     */
    private function waitForRenameTask(EngineClient $engine, int $taskId): bool
    {
        $deadline = now()->getTimestamp() + self::RENAME_WAIT_SECONDS;

        while (now()->getTimestamp() < $deadline) {
            try {
                $task = $engine->task($taskId);
            } catch (EngineUnavailableException|EngineRequestException $e) {
                // Best effort: the rename is queued Engine-side, so a poll hiccup
                // only stops the wait, it never fails the request.
                report($e);

                return false;
            }

            $status = Payload::string($task['status'] ?? '');
            if ($status === 'completed') {
                return true;
            }

            if (in_array($status, ['failed', 'cancelled'], true)) {
                throw ValidationException::withMessages([$this->taskError($task)]);
            }

            Sleep::sleep(self::RENAME_POLL_SECONDS);
        }

        return false;
    }

    /**
     * The Engine message of a failed task (`TaskResource` → `details.error` /
     * `details.problems[]`, the shape WatchApplicationTaskJob reads).
     *
     * @param  array<string, mixed>  $task
     */
    private function taskError(array $task): string
    {
        $details = Payload::object($task['details'] ?? null);

        $error = Payload::nullableString($details['error'] ?? null);
        if ($error !== null && $error !== '') {
            return $error;
        }

        foreach (Payload::objects($details['problems'] ?? null) as $problem) {
            $message = Payload::nullableString($problem['message'] ?? null);
            if ($message !== null && $message !== '') {
                return $message;
            }
        }

        return self::DATABASE_RENAME_FAILED;
    }

    /**
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function users(Application $application): array
    {
        $users = (new MysqlApi($application->engine()))->users($application->engineProject());

        return [
            'data' => $this->presenter->users($users),
            'meta' => [
                'require_database_to_create' => false,
                'privileges_supported' => true,
                // Engine users can be renamed; the CA shows the rename action.
                'rename_supported' => true,
            ],
        ];
    }

    public function createUser(Application $application, string $name, string $password): void
    {
        (new MysqlApi($application->engine()))->createUser($application->engineProject(), $name, $password);
    }

    public function deleteUser(Application $application, string $name): void
    {
        (new MysqlApi($application->engine()))->deleteUser($application->engineProject(), $name);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function updateUser(Application $application, string $name, array $params): void
    {
        $api = new MysqlApi($application->engine());

        // The route `{name}` is the Engine's stored (prefixed) name; the CA body
        // carries the unprefixed name. Normalise through the account prefix
        // before comparing, or an unchanged name renames to itself and a rename
        // changes the password on the old name.
        $prefix = $application->mysqlPrefix();
        $current = $name;

        $unprefixed = Payload::nullableString($params['name'] ?? null);
        if ($unprefixed !== null && $unprefixed !== '') {
            $desired = $prefix.$unprefixed;
            if ($desired !== $current) {
                $api->renameUser($application->engineProject(), $current, $unprefixed);
                $current = $desired;
            }
        }

        $password = Payload::nullableString($params['password'] ?? null);
        if ($password !== null && $password !== '') {
            // The Engine looks the user up by its exact stored name, so the
            // password change must target the post-rename name.
            $api->changeUserPassword($application->engineProject(), $current, $password);
        }
    }

    /**
     * @return array{data: array<string, mixed>|string}
     */
    public function privileges(Application $application, string $user, string $database): array
    {
        return ['data' => (new MysqlApi($application->engine()))->privileges($application->engineProject(), $user, $database)];
    }

    public function updatePrivileges(Application $application, string $user, string $database, string $privileges): void
    {
        (new MysqlApi($application->engine()))->updatePrivileges($application->engineProject(), $user, $database, $privileges);
    }

    public function revokePrivileges(Application $application, string $user, string $database): void
    {
        (new MysqlApi($application->engine()))->revokePrivileges($application->engineProject(), $user, $database);
    }

    /**
     * @return array{data: array<string, mixed>}
     */
    public function serverInfo(Application $application): array
    {
        // The Engine answers the users-DB host its own deploys pin for the
        // account, the only one the project's PHP can reach; its domain serves
        // HTTP on 443, never MySQL on 3306.
        return ['data' => (new MysqlApi($application->engine()))->serverInfo($application->engineProject())];
    }

    /**
     * @return array{data: array<string, mixed>}
     */
    public function phpmyadminSso(Application $application): array
    {
        return ['data' => (new MysqlApi($application->engine()))->phpmyadminSsoToken($application->engineProject())];
    }

    /**
     * The access-type refusal: the Engine has no per-account access
     * type (projects get SFTP only), so the CA action answers the documented
     * key-0 422 instead of an HTML/405. Ending sessions is an Engine call
     * since Engine `29ae` (`disconnectAllSftpSessions()`).
     */
    public const SFTP_ACCESS_TYPE_REFUSAL = 'Changing the SFTP account access type is not available until the Engine adds a dedicated endpoint.';

    // Database rename. An undetected project fails closed; a
    // WordPress project's DB_NAME follows the rename since Engine 2.2.0.
    public const DATABASE_RENAME_UNKNOWN_REFUSAL = 'The project kind is not known yet, so its database cannot be renamed.';

    public const DATABASE_RENAME_FAILED = 'The Engine could not rename the database.';

    /** Seconds between Engine task polls while a rename runs. */
    public const RENAME_POLL_SECONDS = 3;

    /**
     * Wall-clock budget for following a rename task. The rename stays queued
     * Engine-side when it runs out, so the request answers success rather than a
     * false failure.
     */
    public const RENAME_WAIT_SECONDS = 30;

    /**
     * The Engine now refuses the domain PHP version/directives on
     * a container (dind) project, whose PHP comes from its own image
     * (`DomainPhpVersion::ensurePhpHosting`, `Php::requirePhpHosting`). v1 answers
     * the same 422 before the Engine, so the CA shows the reason instead of a
     * generic error (the read used to show settings).
     */
    public const PHP_HOSTING_VERSION_REFUSAL = 'The PHP version applies only to PHP hosting projects. A dind project runs PHP from its own image; set it there.';

    public const PHP_HOSTING_SETTINGS_REFUSAL = 'Custom PHP INI settings apply only to PHP hosting projects. A dind project runs PHP from its own image; set php.ini there.';

    /**
     * The four PHP settings the panel shows. The Engine keeps only the
     * directives a domain sets, not the values PHP runs with.
     *
     * @var list<string>
     */
    private const array SUGGESTED_PHP_DIRECTIVES = [
        'memory_limit',
        'upload_max_filesize',
        'post_max_size',
        'max_execution_time',
    ];

    // ---- FTP accounts ---------------------------------------------------

    /**
     * @return array{data: list<array<string, mixed>>, meta: array{usage: bool}}
     */
    public function ftpAccounts(Application $application): array
    {
        return [
            'data' => $this->accounts->ftpList((new AccountsApi($application->engine()))->ftpAccounts($application->engineProject())),
            'meta' => ['usage' => true],
        ];
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function createFtpAccount(Application $application, array $params): void
    {
        (new AccountsApi($application->engine()))->createFtpAccount($application->engineProject(), $params);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function updateFtpAccount(Application $application, string $user, array $params): void
    {
        (new AccountsApi($application->engine()))->updateFtpAccount($application->engineProject(), $user, $params);
    }

    public function deleteFtpAccount(Application $application, string $user): void
    {
        (new AccountsApi($application->engine()))->deleteFtpAccount($application->engineProject(), $user);
    }

    /**
     * The FTP host/port shown in the account info modal. The Engine serves FTP
     * on the account's host; old panel used the domain and port 21.
     *
     * @return array{data: array{host: string, port: int}}
     */
    public function ftpServerInfo(Application $application): array
    {
        return ['data' => ['host' => $this->accountHost($application), 'port' => 21]];
    }

    /**
     * The project's own domain, or the server's address on a name the proxy serves (web ports only).
     */
    private function accountHost(Application $application): string
    {
        $domain = (string) $application->domain;

        if (! SystemApi::inOnlineZone($domain)) {
            return $domain;
        }

        return $application->publicIp() ?? $domain;
    }

    // ---- SFTP accounts --------------------------------------------------

    /**
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function sftpAccounts(Application $application): array
    {
        return [
            'data' => $this->accounts->sftpList((new AccountsApi($application->engine()))->sftpAccounts($application->engineProject())),
            'meta' => [
                // The Engine has no per-account access type; accounts are always
                // SFTP-only.
                'access_type' => 'sftp',
                'actions' => ['edit_password'],
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function createSftpAccount(Application $application, array $params): void
    {
        (new AccountsApi($application->engine()))->createSftpAccount($application->engineProject(), $this->sftpParams($application, $params, true));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function updateSftpAccount(Application $application, string $user, array $params): void
    {
        (new AccountsApi($application->engine()))->updateSftpAccount($application->engineProject(), $user, $this->sftpParams($application, $params, false));
    }

    /**
     * Map the CA's SFTP body to the Engine's: `type` → `auth_method`, and a
     * `{engine_username}_` prefix on a create username (the Engine's account
     * naming).
     *
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    private function sftpParams(Application $application, array $params, bool $create): array
    {
        $type = Payload::string($params['type'] ?? 'password');

        // Only the credential the chosen `type` uses.
        $mapped = [
            'auth_method' => $type,
            'password' => $type === 'password' ? ($params['password'] ?? null) : null,
            'public_key' => $type === 'public_key' ? ($params['public_key'] ?? null) : null,
        ];

        if ($create) {
            $username = Payload::string($params['username'] ?? '');
            $prefix = $application->engine_username.'_';
            $username = str_starts_with($username, $prefix) ? $username : $prefix.$username;

            // Engine max is 32; the `{engine_username}_` prefix counts.
            if (strlen($username) > 32) {
                throw ValidationException::withMessages(['username' => ['The username is too long for this project.']]);
            }

            $mapped['username'] = $username;
        }

        return array_filter($mapped, static fn ($v) => $v !== null);
    }

    public function deleteSftpAccount(Application $application, string $user): void
    {
        (new AccountsApi($application->engine()))->deleteSftpAccount($application->engineProject(), $user);
    }

    /**
     * POST /server-accounts/{id}/sftp-accounts/disconnect-all – end every open
     * SFTP session through the Engine `sftp-accounts/kill-sessions`
     * (`core/app/Http/Controllers/User/SftpAccountController.php:270`, `killSessionsAll`,
     * since Engine `29ae`). The CA ignores the body (Sftp.vue:628).
     */
    public function disconnectAllSftpSessions(Application $application): void
    {
        (new AccountsApi($application->engine()))->killSftpSessions($application->engineProject());
    }

    /**
     * POST /server-accounts/{id}/sftp-accounts/set-access-type – the
     * Engine has no per-account access type, so refuse. The request still
     * validates `access_type` first (old SftpAccountController::setAccessType).
     */
    public function setSftpAccessType(Application $application, string $accessType): void
    {
        throw ValidationException::withMessages([self::SFTP_ACCESS_TYPE_REFUSAL]);
    }

    /**
     * SFTP host/port. The Engine serves SFTP on port 2222 (old panel hard-coded
     * it; the Engine does not report it either).
     *
     * @return array{data: array{host: string, port: int}}
     */
    public function sftpServerInfo(Application $application): array
    {
        return ['data' => ['host' => $this->accountHost($application), 'port' => 2222]];
    }

    // ---- Cron jobs ------------------------------------------------------

    /**
     * `meta.services`: the Compose services a container project's job
     * can run in, which the Add/Edit dialog offers; null on PHP hosting, whose
     * jobs name no service.
     *
     * @return array{data: list<array<string, mixed>>, meta: array{services: list<string>|null}}
     */
    public function cronJobs(Application $application): array
    {
        return [
            'data' => $this->accounts->cronList((new AccountsApi($application->engine()))->cronJobs($application->engineProject())),
            'meta' => ['services' => $application->isContainer() ? $this->composeServices($application) : null],
        ];
    }

    /**
     * The services of the project's containers (`GET E:/containers`), once
     * each, in the Engine's order. A project not deployed yet has none, and a
     * failed read leaves the list empty instead of failing the cron page.
     *
     * @return list<string>
     */
    private function composeServices(Application $application): array
    {
        try {
            $containers = (new ContainersApi($application->engine()))->list($application->engineProject());
        } catch (EngineRequestException|EngineUnavailableException) {
            return [];
        }

        $services = [];
        foreach ($containers as $container) {
            $service = Payload::nullableString($container['Service'] ?? null);
            if ($service !== null && $service !== '' && ! in_array($service, $services, true)) {
                $services[] = $service;
            }
        }

        return $services;
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function createCronJob(Application $application, array $params): void
    {
        (new AccountsApi($application->engine()))->createCronJob($application->engineProject(), $this->cronParams($params));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function updateCronJob(Application $application, string $hash, array $params): void
    {
        (new AccountsApi($application->engine()))->updateCronJob($application->engineProject(), $hash, $this->cronParams($params));
    }

    /**
     * A job without a service sends none: the Engine refuses the field on PHP
     * hosting, and on a container project it answers its own `service` 422.
     *
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    private function cronParams(array $params): array
    {
        if (($params['service'] ?? null) === null) {
            unset($params['service']);
        }

        return $params;
    }

    public function deleteCronJob(Application $application, string $hash): void
    {
        (new AccountsApi($application->engine()))->deleteCronJob($application->engineProject(), $hash);
    }

    // ---- Domains & SSL & PHP ---------------------------------------------

    /**
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function domains(Application $application): array
    {
        $domains = (new DomainsApi($application->engine()))->domains($application->engineProject());

        return [
            'data' => $this->domains->presentList($domains, (string) $application->id),
            // DNS servers are disabled in single-server; the CA offers addon and
            // sub domains.
            'meta' => [
                'domain_types' => ['addon', 'sub'],
                'actions' => ['edit', 'delete'],
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function createDomain(Application $application, array $params): void
    {
        (new DomainsApi($application->engine()))->createDomain($application->engineProject(), AddonDomain::withWwwAlias($params));
        ProjectDomainCreated::dispatch($application, Payload::string($params['domain'] ?? null), Payload::string($params['type'] ?? null));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function updateDomain(Application $application, string $domain, array $params): void
    {
        (new DomainsApi($application->engine()))->updateDomain($application->engineProject(), $domain, $params);
    }

    public function deleteDomain(Application $application, string $domain): void
    {
        // The CA hides delete for `type == main` (HostingDomainsTable.vue:235), so
        // refuse the project's main domain here – without an Engine call – with the
        // old panel's message (messages.php:57, `cannot_delete_main_domain`). The
        // Engine now refuses a main domain too
        // (`User/DomainController.php:375-390`, 422 `domain`), but only for the
        // Engine's own main domain; v1's guard stays first and a stale mirror that
        // slips past it surfaces the Engine's field error.
        if ($domain === (string) $application->domain) {
            throw ValidationException::withMessages(['Cannot delete main domain']);
        }

        (new DomainsApi($application->engine()))->deleteDomain($application->engineProject(), $domain);
        ProjectDomainDeleted::dispatch($application, $domain, '');
    }

    /**
     * Make an addon domain the project's primary domain through the
     * `PrimaryDomainSwitcher` (the composed switch).
     */
    public function setAsPrimaryDomain(Application $application, string $domain): void
    {
        // The switch removes the addon before it renames the main domain, which
        // the Engine refuses on a protected project (EnsureProjectNotProtected.php:43/138):
        // refuse before the first Engine write.
        ProtectedProject::refuse($application->engineProject());

        $this->domainSwitcher->switch($application, $domain);
    }

    /**
     * The SSL providers the CA can order from (old SslOfferController). The
     * single-server Engine issues Let's Encrypt itself, so this is a constant.
     *
     * @return list<array{id: int, name: string, slug: string}>
     */
    public function sslOffer(): array
    {
        return [
            ['id' => 1, 'name' => "Let's Encrypt", 'slug' => 'lets-encrypt'],
        ];
    }

    /**
     * The project's Engine name for the domain, or the old 422 when the domain
     * is not one of the project's.
     *
     * @throws ValidationException
     */
    private function assertDomainBelongsTo(Application $application, string $domain): string
    {
        $match = $this->projectDomain($application, $domain);
        if ($match === null) {
            throw ValidationException::withMessages(['domain' => ['Invalid domain.']]);
        }

        return Payload::string($match['domain'] ?? '');
    }

    /**
     * A container (dind) project runs PHP from its own image, so
     * the Engine refuses the domain PHP version/directives with 422
     * (`DomainPhpVersion::ensurePhpHosting`, `Php::requirePhpHosting`). Refuse
     * before any Engine call, with the Engine's own field and text.
     *
     * @throws ValidationException
     */
    private function assertPhpHosting(Application $application, string $field, string $message): void
    {
        if ($application->isContainer()) {
            throw ValidationException::withMessages([$field => [$message]]);
        }
    }

    /**
     * The installed certificate, or `null` when the Engine has none for the
     * domain (an Engine 404 means "not configured", §7.5 "Degrade only on
     * absence"). A domain that is not one of the project's answers the old
     * 422 key 0 `Invalid domain` (old `getInstalledCertificate`,
     * ServerAccount/SslController.php:58-62).
     *
     * @return array{data: array<string, mixed>|null}
     */
    public function installedSslCert(Application $application, string $domain): array
    {
        $match = $this->projectDomain($application, $domain);
        if ($match === null) {
            throw ValidationException::withMessages(['Invalid domain']);
        }

        return ['data' => $this->serverCertificate($application, Payload::string($match['domain'] ?? ''))];
    }

    /**
     * How long one Engine `ssl-check` answer is reused. A check makes two TLS
     * handshakes (0.6-1.7 s) and the Domains page asks for the server and the
     * detected certificate of every domain, so the two reads share one check;
     * installing or requesting a certificate forgets it.
     */
    private const SSL_CHECK_TTL_SECONDS = 30;

    /**
     * The certificate a project domain really serves to visitors, from the
     * Engine's live `ssl-check` (a TLS handshake at the address the domain's DNS
     * gives), with its verdict; null when nothing served one. An Engine without
     * the route (before 2.2.0) falls back to the installed certificate, as it
     * read before the check existed. `points_here` is also true for a domain
     * served through a tunnel of its own name ({@see withTunnelVerdict()}).
     *
     * @return array<string, mixed>|null
     */
    public function servedCertificate(Application $application, string $domain): ?array
    {
        $check = $this->sslCheck($application, $domain);

        return $check === null
            ? $this->engineCertificate($application, $domain)
            : $this->certificates->presentServed($check);
    }

    /**
     * The certificate the project's webserver really serves for the domain
     * (`ssl-check`'s `engine` side), in the installed route's shape (empty
     * `id`, old six keys, verdict, `serves_installed`); null when it served
     * none. The installed file stands in on an Engine without `ssl-check`, or
     * when the Engine could not tell where the webserver listens.
     *
     * @return array<string, mixed>|null
     */
    public function serverCertificate(Application $application, string $domain): ?array
    {
        $check = $this->sslCheck($application, $domain);
        if ($check === null || ! is_array($check['engine'] ?? null)) {
            return $this->certificates->presentInstalled($this->readInstalledSslCert($application, $domain));
        }

        $served = $this->certificates->presentServed($check, 'engine');

        return $served === null ? null : ['id' => ''] + $served;
    }

    /**
     * The Engine's `ssl-check` for a project domain, reused for
     * {@see SSL_CHECK_TTL_SECONDS}; null on an Engine without the route (404).
     *
     * @return array<string, mixed>|null
     */
    private function sslCheck(Application $application, string $domain): ?array
    {
        $key = self::sslCheckKey($application, $domain);
        /** @var mixed $cached */
        $cached = Cache::get($key);
        if (is_array($cached)) {
            return Payload::object($cached);
        }

        try {
            $check = (new DomainsApi($application->engine()))->sslCheck($application->engineProject(), $domain);
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 404) {
                throw $e;
            }

            return null;
        }

        $check = $this->withTunnelVerdict($application, $domain, $check);

        Cache::put($key, $check, self::SSL_CHECK_TTL_SECONDS);

        return $check;
    }

    /**
     * The Engine sets `dns.points_here` only by comparing the domain's DNS
     * addresses with the project's IPs. A domain served through a tunnel
     * (a PanelAlpha Online name behind the proxy, or a Cloudflare tunnel)
     * never resolves to those IPs, although visitors reach this host through
     * it, and the client area shows "Wrong DNS" for `false` (issue 261, P14).
     * Such a domain counts as pointing here when one of its tunnels has the
     * domain's own name; a preview tunnel has another name and does not hide
     * a domain that really points elsewhere. A failed tunnel read keeps the
     * Engine's verdict.
     *
     * @param  array<string, mixed>  $check  Engine `SslCheck` data
     * @return array<string, mixed>
     */
    private function withTunnelVerdict(Application $application, string $domain, array $check): array
    {
        $dns = Payload::object($check['dns'] ?? null);
        if (($dns['points_here'] ?? null) !== false) {
            return $check;
        }

        try {
            $tunnels = (new DomainsApi($application->engine()))->tunnels($application->engineProject(), $domain);
        } catch (EngineException $e) {
            if (! $e instanceof EngineRequestException || $e->engineStatus !== 404) {
                report($e);
            }

            return $check;
        }

        foreach ($tunnels as $tunnel) {
            $hostname = Payload::nullableString($tunnel['hostname'] ?? null);
            if ($hostname !== null && strtolower($hostname) === strtolower($domain)) {
                $check['dns'] = ['points_here' => true, 'tunnel' => Payload::nullableString($tunnel['provider'] ?? null)] + $dns;

                return $check;
            }
        }

        return $check;
    }

    private function forgetSslCheck(Application $application, string $domain): void
    {
        Cache::forget(self::sslCheckKey($application, $domain));
    }

    private static function sslCheckKey(Application $application, string $domain): string
    {
        return 'client-area.ssl-check:'.$application->engine_id.':'.$application->engineProject()->username.':'.strtolower($domain);
    }

    /**
     * The certificate the Engine holds for a project domain with its validity
     * verdict, in the installed route's shape without the empty `id`; null
     * when the Engine has none (or does not know the domain). The detected
     * routes read this instead of opening a TLS socket from the panel.
     *
     * @return array<string, mixed>|null
     */
    public function engineCertificate(Application $application, string $domain): ?array
    {
        $presented = $this->certificates->presentInstalled($this->readInstalledSslCert($application, $domain));

        return $presented === null ? null : array_diff_key($presented, ['id' => true]);
    }

    /**
     * The Engine's installed certificate for the domain, or null on a 404
     * ("Engine has none" – §7.5 "Degrade only on absence").
     *
     * @return array<string, mixed>|null
     */
    private function readInstalledSslCert(Application $application, string $domain): ?array
    {
        try {
            return (new DomainsApi($application->engine()))->installedSslCert($application->engineProject(), $domain);
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 404) {
                throw $e;
            }

            return null;
        }
    }

    /**
     * The project's own domain row from `GET domains`, or null (old
     * `findDomain`). The CA sends the project's domain back as it was shown,
     * without `www.`: a domain of exactly that name wins,
     * otherwise the presented main domain matches the mirrored one.
     *
     * @return array<string, mixed>|null
     */
    private function projectDomain(Application $application, string $domain): ?array
    {
        $domains = (new DomainsApi($application->engine()))->domains($application->engineProject());

        foreach ([$domain, $application->engineDomainName($domain)] as $name) {
            foreach ($domains as $candidate) {
                if (($candidate['domain'] ?? null) === $name) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    /**
     * The Engine name for a domain the CA sent to a route that does not list
     * the project's domains: only the presented main domain
     * costs one `GET domains`, where a domain of exactly that name still wins.
     */
    private function engineDomain(Application $application, string $domain): string
    {
        if ($application->engineDomainName($domain) === $domain) {
            return $domain;
        }

        $match = $this->projectDomain($application, $domain);

        return $match === null ? $domain : Payload::string($match['domain'] ?? '');
    }

    /**
     * @return array{data: array<string, mixed>}
     */
    public function requestSslCert(Application $application, string $domain): array
    {
        $engineDomain = $this->engineDomain($application, $domain);
        $order = (new DomainsApi($application->engine()))->requestSslCert($application->engineProject(), $engineDomain);
        $this->forgetSslCheck($application, $engineDomain);

        // The Engine issues the requested certificate within the call; broadcast
        // only when it did, so an open page does not clear a pending order.
        if ($this->installedCertificateAfterOrder($application, $engineDomain)) {
            $this->broadcastSslInstalled($application);
        }

        return ['data' => $order];
    }

    /**
     * Tells the project's open pages that a certificate changed. A push that
     * cannot be delivered is reported, never turned into a failed SSL write.
     */
    private function broadcastSslInstalled(Application $application): void
    {
        try {
            SslCertificateInstalled::forEveryone($application);
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * Whether the Engine has a certificate for the domain after an order. A
     * failed read leaves the order as it is: the next page load shows the
     * certificate anyway.
     */
    private function installedCertificateAfterOrder(Application $application, string $domain): bool
    {
        try {
            return $this->readInstalledSslCert($application, $domain) !== null;
        } catch (Throwable $e) {
            report($e);

            return false;
        }
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function installSslCert(Application $application, string $domain, array $params): void
    {
        $engineDomain = $this->engineDomain($application, $domain);
        (new DomainsApi($application->engine()))->installSslCert($application->engineProject(), $engineDomain, [
            'cert' => Payload::string($params['certificate'] ?? ''),
            'key' => Payload::string($params['key'] ?? ''),
            'ca' => Payload::string($params['cabundle'] ?? ''),
        ]);
        $this->forgetSslCheck($application, $engineDomain);

        // The Engine installed the certificate in this call, so every open page
        // of the project can show it without a reload.
        $this->broadcastSslInstalled($application);
    }

    /**
     * An Engine that predates the certificate removal route answers 405 (the
     * path serves a GET) or 404 (no such path); the panel says in plain words
     * that the server cannot do it rather than pass the framework's answer on.
     */
    public const SSL_REMOVE_UNAVAILABLE = 'This server\'s Engine cannot remove a certificate yet.';

    /**
     * Removes the certificate installed on the project's domain and answers the
     * one the Engine gives it back (the certificate a new domain gets), in the
     * installed route's shape. The Engine's 404/405 there is the Engine that
     * predates the route, refused in the panel's own words.
     *
     * @return array{data: array<string, mixed>|null}
     */
    public function removeSslCert(Application $application, string $domain): array
    {
        $match = $this->projectDomain($application, $domain);
        if ($match === null) {
            throw ValidationException::withMessages(['Invalid domain']);
        }
        $engineDomain = Payload::string($match['domain'] ?? '');

        try {
            $certificate = (new DomainsApi($application->engine()))->removeSslCert($application->engineProject(), $engineDomain);
        } catch (EngineRequestException $e) {
            if (! in_array($e->engineStatus, [404, 405], true)) {
                throw $e;
            }

            throw ValidationException::withMessages(['domain' => self::SSL_REMOVE_UNAVAILABLE]);
        }

        // The served certificate changed: a cached ssl-check would answer the old one.
        $this->forgetSslCheck($application, $engineDomain);
        $this->broadcastSslInstalled($application);

        return ['data' => $this->certificates->presentInstalled($certificate)];
    }

    /**
     * The forced-HTTPS setting of one domain, shaped as the CA reads it.
     *
     * @return array{data: array<string, mixed>}
     */
    public function sslSettings(Application $application, string $domain, Authenticatable $user): array
    {
        $match = $this->projectDomain($application, $domain);

        if ($match === null) {
            // Old `showDomainSettings` used `whereHas('domains')->findOrFail`
            // (ServerAccount/SslController.php:314-320): a foreign domain is a
            // 404, not a validation error.
            abort(404);
        }
        $domain = Payload::string($match['domain'] ?? '');

        $details = Payload::object($match['details'] ?? null);

        // Read the installed cert from the Engine; a 404 means "no certificate"
        //One `GET domains` already checked
        // membership above; the certificate read skips that check. The settings
        // shape is the full old `getSslInfo` certificate, unlike the installed
        // route's six keys.
        $certificate = $this->certificates->present($this->readInstalledSslCert($application, $domain));
        // Judged by what the webserver really serves, not by the file: the file
        // keeps the PEM and the names.
        $check = $certificate === null ? null : $this->sslCheck($application, $domain);
        $served = $check === null ? null : $this->certificates->presentServed($check, 'engine');
        if ($certificate !== null && $served !== null) {
            $certificate = $this->certificates->judgedByServed($certificate, $served);
        }

        return ['data' => [
            'certificate_installed' => $certificate !== null,
            'certificate' => $certificate,
            'can_https_redirect' => $certificate !== null,
            // The old showDomainSettings listed the account's applications on
            // the same domain (ServerAccount/SslController.php:318-327), which
            // the CA filters down to the *other* instances
            // (Security.vue:371-379).
            'domain_shared_instances' => $this->sharedInstances($application, $domain, $user),
            'force_https_redirect' => (bool) ($details['force_https_redirect'] ?? false),
        ]];
    }

    /**
     * @return list<array{id: int, name: string, url: string}>
     */
    private function sharedInstances(Application $application, string $domain, Authenticatable $user): array
    {
        // Visibility goes through the repository: `forUser(refresh: false)`,
        // this is a read on a CA request path.
        /** @var list<array{id: int, name: string, url: string}> $instances */
        $instances = $this->applications->forUser($user, false)
            ->filter(fn (Application $item): bool => (string) $item->domain === $domain)
            ->map(static fn (Application $item): array => [
                'id' => $item->id,
                'name' => (string) ($item->name ?? ''),
                'url' => $item->url(),
            ])
            ->values()
            ->all();

        return $instances;
    }

    public function setSslSettings(Application $application, string $domain, bool $forceHttps): void
    {
        // Old `whereHas('domains')->findOrFail` answered 404 for a domain that
        // is not the project's, before any Engine write
        // (ServerAccount/SslController.php:314-320).
        $match = $this->projectDomain($application, $domain);
        if ($match === null) {
            abort(404);
        }

        (new DomainsApi($application->engine()))->updateDomain($application->engineProject(), Payload::string($match['domain'] ?? ''), [
            'force_https_redirect' => $forceHttps,
        ]);
    }

    /**
     * @return array{data: array<string, mixed>|string}
     */
    public function phpVersion(Application $application, string $domain): array
    {
        $domain = $this->assertDomainBelongsTo($application, $domain);

        return ['data' => (new DomainsApi($application->engine()))->phpVersion($application->engineProject(), $domain)];
    }

    public function setPhpVersion(Application $application, string $domain, string $version): void
    {
        $domain = $this->assertDomainBelongsTo($application, $domain);
        $this->assertPhpHosting($application, 'version', self::PHP_HOSTING_VERSION_REFUSAL);

        (new DomainsApi($application->engine()))->setPhpVersion($application->engineProject(), $domain, ['version' => $version]);
    }

    /**
     * The CA's PHP settings modal reads `directives` (a list of
     * `{directive, value}`), `configurable`, `custom_directives` and
     * `suggested_directives`. The Engine stores custom ini settings as a
     * directive => value map.
     *
     * @return array<string, mixed>
     */
    public function phpSettings(Application $application, string $domain): array
    {
        $domain = $this->assertDomainBelongsTo($application, $domain);
        $this->assertPhpHosting($application, 'project', self::PHP_HOSTING_SETTINGS_REFUSAL);

        $settings = (new DomainsApi($application->engine()))->phpDirectives($application->engineProject(), $domain);

        $directives = [];
        foreach (array_keys($settings) as $directive) {
            $directives[] = ['directive' => $directive, 'value' => $settings[$directive]];
        }

        // The settings the guide names are listed with an empty value until the
        // domain sets them, so the dialog offers them without a name to type.
        foreach (self::SUGGESTED_PHP_DIRECTIVES as $directive) {
            if (! array_key_exists($directive, $settings)) {
                $directives[] = ['directive' => $directive, 'value' => ''];
            }
        }

        return [
            'configurable' => true,
            'custom_directives' => true,
            'directives' => $directives,
            'suggested_directives' => array_map(
                static fn (string $directive): array => ['directive' => $directive, 'type' => 'text'],
                self::SUGGESTED_PHP_DIRECTIVES,
            ),
            'modifiable_directives_list' => true,
        ];
    }

    /**
     * @param  array<string, string|null>  $settings  directive => value
     */
    public function setPhpSettings(Application $application, string $domain, array $settings): void
    {
        $domain = $this->assertDomainBelongsTo($application, $domain);
        $this->assertPhpHosting($application, 'project', self::PHP_HOSTING_SETTINGS_REFUSAL);

        // The old panel accepted only the directives its own PHP knows
        // (`array_keys(ini_get_all(null, false))`,
        // ServerAccount/DomainController.php:486-492) and refused the rest with
        // the key-0 `invalid_php_directive` text.
        $available = ini_get_all(null, false);
        $allowed = is_array($available) ? array_keys($available) : [];

        foreach ($settings as $directive => $value) {
            if (! in_array($directive, $allowed, true)) {
                throw ValidationException::withMessages(['Invalid PHP directive: '.$directive.'.']);
            }

            if (is_string($value) && preg_match("/[\n\x00]/", $value)) {
                throw ValidationException::withMessages(['settings' => ['Invalid directive value.']]);
            }

            // A cleared setting stays out of the map, which the Engine replaces whole: its file loses that directive.
            if ($value === null || $value === '') {
                unset($settings[$directive]);
            }
        }

        (new DomainsApi($application->engine()))->setPhpDirectives($application->engineProject(), $domain, ['settings' => $settings]);
    }

    /**
     * @return array{data: list<string>}
     */
    public function phpVersions(Application $application): array
    {
        return ['data' => (new DomainsApi($application->engine()))->availablePhpVersions()];
    }

    /**
     * @return array{data: array<string, mixed>}
     */
    /**
     * @return array{data: array<string, mixed>, supported_metrics: array<string, bool>}
     */
    public function usage(Application $application): array
    {
        return $this->usagePresenter->present(
            (new UsageApi($application->engine()))->usage($application->engineProject()),
        );
    }
}
