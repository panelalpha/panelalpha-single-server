<?php

namespace PanelAlpha\ClientArea\Jobs\WordPress;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Sleep;
use Illuminate\Support\Str;
use PanelAlpha\ClientArea\Events\ClientAreaNotificationRequested;
use PanelAlpha\ClientArea\Hosting\DocumentRootResolver;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressInstall;
use PanelAlpha\ClientArea\Projects\ProjectWordPressDetails;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\Api\MysqlApi;
use PanelAlpha\EngineClient\Api\TasksApi;
use PanelAlpha\EngineClient\Api\WordPressApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use Throwable;

/**
 * Installs WordPress on a classic project (Engine 2.2.0), the chain the Engine team verified:
 *
 * 1. wait until the project's create task (queued by the CA's domain step) and
 *    any other task of the project ended;
 * 2. `POST wp/core/download {locale?, version?, path?}` (a 409 – core files
 *    already there – is a retry finding its earlier download);
 * 3. `POST mysql/databases` (a generated name, or the advanced form's typed
 *    one – an existing database of that name, `GET mysql/databases`, is
 *    reused), `POST mysql/users`,
 *    `PUT mysql/privileges/{user}/{db} {privileges: ALL PRIVILEGES}`;
 * 4. `GET mysql/server-info` for the database host;
 * 5. `POST wp/config {dbname, dbuser, dbpass, dbhost, dbprefix, locale?, force}`;
 * 6. `POST wp/core/install {url, title, admin_user, admin_email,
 *    admin_password, skip_email: true}`;
 * 7. `PUT wp/language {language}` for a non-default locale;
 * 8. best effort: install and activate the chosen theme.
 *
 * Every step is synchronous and the Engine rolls nothing back, so a failure
 * after step 3 drops the database and the user this run created; the install
 * is marked failed with the Engine's message and `installation_failed` is sent
 * (old `InstallInstance::failed`), and retry-install re-runs it. On success the
 * mirror is refreshed, the type re-probed and `installation_finished` sent.
 * Carries the id only; runs on the `long` queue with no automatic retry.
 */
final class InstallWordPressJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    /** The long worker allows 1800 s. */
    public int $timeout = 1750;

    public const QUEUE = 'long';

    public const CONNECTION = 'database-long';

    public const FINISHED_TYPE = 'user.instance.installation_finished';

    public const FAILED_TYPE = 'user.instance.installation_failed';

    /** WP-CLI downloads and installs can take minutes; the default 30 s would fail them. */
    public const ENGINE_TIMEOUT_SECONDS = 600;

    /** How long the project's create task may still run before the install gives up. */
    public const CREATE_WAIT_SECONDS = 900;

    public const POLL_SECONDS = 5;

    public const STILL_CREATING = 'The project is still being created. Try the installation again in a few minutes.';

    public const GENERIC_FAILURE = 'The WordPress installation did not finish.';

    public function __construct(public readonly int $applicationId)
    {
        $this->onQueue(self::QUEUE);
        $this->onConnection(self::CONNECTION);
    }

    public function handle(ApplicationSynchronizer $synchronizer, DocumentRootResolver $documentRoots): void
    {
        $application = Application::query()->find($this->applicationId);
        $install = $application?->wordpressInstall;
        if ($application === null || $install === null || $install->status !== WordPressInstall::IN_PROGRESS) {
            return;
        }

        /** @var array{database?: string, user?: string} $created */
        $created = [];

        try {
            if (! $this->waitForCreate($application)) {
                $this->fail($application, $install, self::STILL_CREATING);

                return;
            }
            $this->install($application, $install, $documentRoots, $created);
        } catch (EngineException|EngineValidationException|ProjectProtectedException $e) {
            $this->rollback($application, $created);
            $this->fail($application, $install, EngineErrors::message($e));

            return;
        }

        $this->installTheme($application, $install);

        // The form is not needed any more; keep no admin password at rest.
        $params = $install->params;
        unset($params['admin_password']);
        $install->update(['status' => WordPressInstall::FINISHED, 'error' => null, 'params' => $params]);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();

        // The Installation card reads the version from this cache; filled here
        // so the CA's reload after the notification already finds it.
        app(ProjectWordPressDetails::class)->refresh($application);

        try {
            $synchronizer->sync($application->engine_id);
        } catch (EngineException $e) {
            report($e);
        }

        ClientAreaNotificationRequested::dispatch($application->refresh(), self::FINISHED_TYPE, includeInstance: true);
    }

    /**
     * Safety net: any unexpected exception (a timeout, a worker crash) still
     * ends the CA spinner.
     */
    public function failed(?Throwable $exception = null): void
    {
        $application = Application::query()->find($this->applicationId);
        $install = $application?->wordpressInstall;
        if ($application === null || $install === null || $install->status !== WordPressInstall::IN_PROGRESS) {
            return;
        }

        $this->fail($application, $install, self::GENERIC_FAILURE);
    }

    /**
     * @param  array{database?: string, user?: string}  $created
     */
    private function install(Application $application, WordPressInstall $install, DocumentRootResolver $documentRoots, array &$created): void
    {
        $engine = $application->engine()->withTimeout(self::ENGINE_TIMEOUT_SECONDS);
        $project = $application->engineProject();
        $wordpress = new WordPressApi($engine);
        $mysql = new MysqlApi($engine);
        $params = $install->params;
        $locale = Payload::nullableString($params['locale'] ?? null);

        $dir = Payload::string($params['dir'] ?? '');
        // The Engine's `path` is the absolute WP-CLI --path (`WpCli::resolvePath`);
        // omitted, it is the main domain's document root.
        $path = $dir === ''
            ? []
            : ['path' => '/home/'.$application->engine_username.'/'.trim($documentRoots->documentRoot($application), '/').'/'.$dir];

        try {
            $wordpress->coreDownload($project, array_filter([
                'locale' => $locale,
                'version' => Payload::nullableString($params['version'] ?? null),
            ]) + $path);
        } catch (EngineRequestException $e) {
            // A retry finds the core files of its earlier run (never --force).
            if ($e->engineStatus !== 409) {
                throw $e;
            }
        }

        // The Engine prefixes both names with `<username>_` (MySQL user ≤ 32).
        $name = 'wp'.Str::lower(Str::random(6));
        $database = $this->typedDatabase($mysql, $application, Payload::nullableString($params['db_name'] ?? null));
        if ($database === null) {
            $typed = Payload::nullableString($params['db_name'] ?? null);
            $dbName = $typed === null || $typed === '' ? $name : $typed;
            $database = Payload::nullableString($mysql->createDatabase($project, $dbName)->json('data.database'))
                ?? self::prefixed($application, $dbName);
            $created['database'] = $database;
        }

        $password = Str::password(24, symbols: false);
        $user = Payload::nullableString($mysql->createUser($project, $name, $password)->json('data.user'))
            ?? $application->engine_username.'_'.$name;
        $created['user'] = $user;

        $mysql->updatePrivileges($project, $user, $database, 'ALL PRIVILEGES');
        $host = Payload::nullableString($mysql->serverInfo($project)['host'] ?? null);

        $wordpress->createConfig($project, array_filter([
            'dbname' => $database,
            'dbuser' => $user,
            'dbpass' => $password,
            'dbhost' => $host,
            'dbprefix' => Payload::nullableString($params['db_prefix'] ?? null),
            'locale' => $locale,
        ]) + ['force' => true] + $path);

        $wordpress->coreInstall($project, [
            'url' => Payload::string($params['url'] ?? ''),
            'title' => Payload::string($params['title'] ?? ''),
            'admin_user' => Payload::string($params['admin_user'] ?? ''),
            'admin_email' => Payload::string($params['admin_email'] ?? ''),
            'admin_password' => Payload::string($params['admin_password'] ?? ''),
            'skip_email' => true,
        ] + $path);

        if ($locale !== null) {
            $wordpress->setLanguage($project, ['language' => $locale] + $path);
        }
    }

    /**
     * The advanced form's typed database name when the project already has
     * that database (old `prepareDatabase()`, packages/api/app/Lib/
     * Integrations/HostingServers/AbstractHostingServer/Account/
     * AbstractApplication.php:673-687: the name with the account prefix,
     * reused when it exists). A reused database is not this
     * run's, so the rollback never drops it. Null: create one.
     */
    private function typedDatabase(MysqlApi $mysql, Application $application, ?string $typed): ?string
    {
        if ($typed === null || $typed === '') {
            return null;
        }

        $database = self::prefixed($application, $typed);
        foreach ($mysql->databases($application->engineProject()) as $row) {
            if (Payload::nullableString($row['database'] ?? null) === $database) {
                return $database;
            }
        }

        return null;
    }

    /**
     * The Engine's `<username>_` prefix, unless the name carries it
     * (`DatabaseController::store`).
     */
    private static function prefixed(Application $application, string $name): string
    {
        $prefix = $application->engine_username.'_';

        return str_starts_with($name, $prefix) ? $name : $prefix.$name;
    }

    /**
     * Wait until no task of the project is queued or running: the domain step
     * answered before the Engine finished creating it. An Engine hiccup only
     * delays the next poll.
     */
    private function waitForCreate(Application $application): bool
    {
        $deadline = now()->getTimestamp() + self::CREATE_WAIT_SECONDS;
        $api = new TasksApi($application->engine());

        while (true) {
            try {
                $active = $api->list([
                    'username' => (string) $application->engine_username,
                    'status' => 'active',
                    'scope' => 'all',
                    'per_page' => 1,
                ]);
                if ($active['total'] === 0) {
                    return true;
                }
            } catch (EngineUnavailableException $e) {
                report($e);
            }

            if (now()->getTimestamp() >= $deadline) {
                return false;
            }
            Sleep::sleep(self::POLL_SECONDS);
        }
    }

    /**
     * Best effort, as the old `InstallInstance` did after the install: a theme
     * that fails leaves a working site with the default theme.
     */
    private function installTheme(Application $application, WordPressInstall $install): void
    {
        $theme = Payload::nullableString($install->params['theme'] ?? null);
        if ($theme === null || $theme === '') {
            return;
        }

        try {
            $api = new WordPressApi($application->engine()->withTimeout(self::ENGINE_TIMEOUT_SECONDS), $application->wordpressInstallPath());
            $api->installTheme($application->engineProject(), ['slug' => $theme]);
            $api->activateTheme($application->engineProject(), $theme);
        } catch (EngineException|EngineValidationException|ProjectProtectedException $e) {
            report($e);
        }
    }

    /**
     * Drop what this run created; a failure here is reported, never thrown.
     *
     * @param  array{database?: string, user?: string}  $created
     */
    private function rollback(Application $application, array $created): void
    {
        $api = new MysqlApi($application->engine());
        if (isset($created['user'])) {
            try {
                $api->deleteUser($application->engineProject(), $created['user']);
            } catch (Throwable $e) {
                report($e);
            }
        }
        if (isset($created['database'])) {
            try {
                $api->deleteDatabase($application->engineProject(), $created['database']);
            } catch (Throwable $e) {
                report($e);
            }
        }
    }

    private function fail(Application $application, WordPressInstall $install, string $message): void
    {
        $install->update(['status' => WordPressInstall::FAILED, 'error' => $message]);
        ClientAreaNotificationRequested::dispatch($application->refresh(), self::FAILED_TYPE, message: $message, isError: true, includeInstance: true);
    }
}
