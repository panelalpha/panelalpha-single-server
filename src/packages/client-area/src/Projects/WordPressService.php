<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Http\Client\Response;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\DomainsApi;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\EngineClient\Api\WordPressApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Contracts\ProjectFeaturedItems;
use PanelAlpha\ClientArea\Hosting\BackupService;
use PanelAlpha\ClientArea\Hosting\DocumentRootResolver;
use PanelAlpha\ClientArea\Http\Presenters\WordPress\PluginPresenter;
use PanelAlpha\ClientArea\Http\Presenters\WordPress\ThemePresenter;
use PanelAlpha\ClientArea\Jobs\WordPress\RunWordPressActionJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\WordPressAsyncStatus;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\PhpIdentifier;

/**
 * WordPress management for one project, backed by the
 * Engine `[wp]` endpoints. The CA's "updates" view combines core status, core
 * updates, plugin and theme lists.
 */
final class WordPressService
{
    /** WP-CLI never deletes the theme in use. */
    public const ACTIVE_THEME_REFUSAL = 'The active theme cannot be removed.';

    public function __construct(
        private readonly PluginPresenter $plugins,
        private readonly ThemePresenter $themes,
        private readonly DocumentRootResolver $documentRoot,
        private readonly ProjectFeaturedItems $featured,
        private readonly BackupService $backups,
    ) {}

    /**
     * The Engine client of one project's `wp/*` calls, bound to the install the
     * panel made: without its directory the Engine reads the main domain's
     * document root, where a subdirectory install has no WordPress.
     */
    private function api(Application $application): WordPressApi
    {
        return new WordPressApi($application->engine(), $application->wordpressInstallPath());
    }

    /**
     * The featured plugins the project does not have yet (old
     * `PluginController::showFromPackagesList()`): the Engine's
     * plugin list is read only when there is something to filter, so Community
     * (no packages) asks the Engine nothing.
     *
     * @return list<array<string, mixed>>
     */
    public function featuredPlugins(Application $application): array
    {
        $items = $this->featured->plugins($application);

        return $items === [] ? [] : self::notInstalled($items, $this->api($application)->plugins($application->engineProject()));
    }

    /**
     * The featured themes the project does not have yet (old
     * `ThemeController::showFromPackagesList()`).
     *
     * @return list<array<string, mixed>>
     */
    public function featuredThemes(Application $application): array
    {
        $items = $this->featured->themes($application);

        return $items === [] ? [] : self::notInstalled($items, $this->api($application)->themes($application->engineProject()));
    }

    /**
     * The items whose `slug` is not the `name` of an installed one (the old
     * filter on `plugin_details` / `theme_details` names).
     *
     * @param  list<array<string, mixed>>  $items
     * @param  list<array<string, mixed>>  $installed  the Engine's list
     * @return list<array<string, mixed>>
     */
    private static function notInstalled(array $items, array $installed): array
    {
        $names = [];
        foreach ($installed as $row) {
            $name = Payload::nullableString($row['name'] ?? null);
            if ($name !== null) {
                $names[$name] = true;
            }
        }

        return array_values(array_filter($items, static fn (array $item): bool => ! isset($names[Payload::string($item['slug'] ?? null)])));
    }

    /**
     * The theme's screenshot as the CA's `<img>` asks for it (old
     * `ThemeController::screenshot`): `{docroot}/wp-content/themes/{t}/screenshot
     * .png|.jpg` read through `files/download`. null when the theme ships none –
     * the caller answers the placeholder image. The theme name is already
     * whitelisted by the route, and the path stays inside the project home.
     */
    public function themeScreenshot(Application $application, string $theme): ?Response
    {
        $files = new FilesApi($application->engine());
        $docroot = $this->documentRoot->documentRoot($application);

        foreach (['png', 'jpg'] as $extension) {
            $path = ($docroot === '' ? '' : $docroot.'/').'wp-content/themes/'.$theme.'/screenshot.'.$extension;

            try {
                if ($files->exists($application->engineProject(), $path)['exists'] === true) {
                    return $files->downloadStream($application->engineProject(), $path);
                }
            } catch (EngineException $e) {
                report($e);

                return null;
            }
        }

        return null;
    }
    /**
     * @return array<string, mixed>
     */
    public function updates(Application $application): array
    {
        $api = $this->api($application);

        // Reads pass skip_plugins=1 so a broken plugin does not hide the data.
        $core = $api->core($application->engineProject());
        if (! self::hasInstall($core)) {
            return ['wp_version' => null, 'available_updates' => []];
        }

        // The CA reads `available_updates` as a sorted list of core version
        // strings (`Instances.js:460`), not an object.
        $versions = [];
        if (self::checkable($core)) {
            foreach (Payload::objects($api->coreUpdates($application->engineProject())) as $update) {
                $version = Payload::nullableString($update['version'] ?? null);
                if ($version !== null) {
                    $versions[] = $version;
                }
            }
        }

        return [
            'wp_version' => $core['version'] ?? null,
            'available_updates' => $versions,
        ];
    }

    /**
     * Whether `wp/core` names a WordPress with a wp-config.php, which the reads below need.
     *
     * @param  array<string, mixed>  $core
     */
    private static function hasInstall(array $core): bool
    {
        $state = Payload::nullableString($core['state'] ?? null);
        if ($state !== null) {
            return $state === 'installed' || $state === 'db_unreachable';
        }

        // An Engine before the `state` key: `installed` false with a version is WordPress whose database is down.
        return ($core['installed'] ?? null) === true || Payload::nullableString($core['version'] ?? null) !== null;
    }

    /**
     * Whether a wp-cli command that reads the database can run for this core.
     *
     * @param  array<string, mixed>  $core
     */
    private static function checkable(array $core): bool
    {
        $state = Payload::nullableString($core['state'] ?? null);

        return $state === null ? ($core['installed'] ?? null) === true : $state === 'installed';
    }

    /**
     * @return array<string, mixed>
     */
    /**
     * The CA reads `{status: bool}` (old MaintenanceModeController::show).
     *
     * @return array{status: bool}
     */
    public function maintenance(Application $application): array
    {
        $api = $this->api($application);
        if (! self::checkable($api->core($application->engineProject()))) {
            return ['status' => false];
        }

        $data = $api->maintenance($application->engineProject());

        return ['status' => (bool) ($data['enabled'] ?? false)];
    }

    public function setMaintenance(Application $application, bool $status): void
    {
        $this->api($application)->setMaintenance($application->engineProject(), $status);
    }

    /**
     * The CA reads `{status: bool}` (old DebugModeController::show).
     *
     * @return array{status: bool}
     */
    public function debugMode(Application $application): array
    {
        if (! self::hasInstall($this->api($application)->core($application->engineProject()))) {
            return ['status' => false];
        }

        // One `GET wp/config` list; an undefined WP_DEBUG means false –
        // never a 422.
        return ['status' => $this->enabled($this->configMap($application)['WP_DEBUG'] ?? null)];
    }

    /**
     * The old panel's truthiness for a wp-config value read as a string/bool.
     */
    private function enabled(mixed $value): bool
    {
        return $value === true || $value === 'true' || $value === 1 || $value === '1';
    }

    public function setDebugMode(Application $application, bool $status): void
    {
        // Engine `type` is `constant|variable|all` – `boolean` is a 422
        // (core/app/System/…/Config.php).
        $this->api($application)->setConfig($application->engineProject(), 'WP_DEBUG', [
            'value' => $status ? 'true' : 'false',
            'raw' => true,
            'type' => 'constant',
        ]);
    }

    /**
     * @return array<string, mixed>  constant/variable name => value
     */
    private function configMap(Application $application): array
    {
        $map = [];
        foreach (Payload::objects($this->api($application)->config($application->engineProject())) as $row) {
            $name = Payload::nullableString($row['name'] ?? null);
            if ($name !== null) {
                $map[$name] = Payload::string($row['value'] ?? null);
            }
        }

        return $map;
    }

    /**
     * The CA reads `{disabled: bool}` (old SearchEngineIndexingController::show),
     * so `enabled = !disabled`.
     *
     * @return array{disabled: bool}
     */
    public function searchEngineIndexing(Application $application): array
    {
        $data = $this->api($application)->option($application->engineProject(), 'blog_public');

        // The Engine answers `{option, value}` (WpOptionController::show); the
        // body is untrusted, so a 200 without a string value is malformed and
        // must not read as "indexing disabled" - the old panel raised instead
        // of guessing.
        if (! is_array($data) || ! is_string($data['value'] ?? null)) {
            throw new EngineRequestException(400, 'The Engine did not answer the blog_public option.');
        }

        return ['disabled' => $data['value'] !== '1'];
    }

    public function setSearchEngineIndexing(Application $application, bool $status): void
    {
        $this->api($application)->setOption($application->engineProject(), 'blog_public', [
            'value' => $status ? '1' : '0',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    /**
     * Map the Engine's `off`/`on`/`minor` auto-update settings to the CA's
     * `auto_update` (0/1/2), `auto_update_plugins` and `auto_update_themes`
     * (0/1) – the old AbstractWordpress::getAutoUpdate.
     * The Engine `blocked_by` names are passed on as they are (`[]` when absent).
     *
     * @return array{auto_update: int, auto_update_plugins: int, auto_update_themes: int, updater_blocked_by: list<string>}
     */
    public function autoUpdate(Application $application): array
    {
        $data = $this->api($application)->autoUpdate($application->engineProject());

        $core = Payload::string($data['core'] ?? null);

        return [
            'auto_update' => $core === 'minor' ? 2 : ($core === 'on' ? 1 : 0),
            'auto_update_plugins' => ($data['plugins'] ?? null) === 'on' ? 1 : 0,
            'auto_update_themes' => ($data['themes'] ?? null) === 'on' ? 1 : 0,
            'updater_blocked_by' => Payload::strings($data['blocked_by'] ?? null),
        ];
    }

    /**
     * Write **only** the fields the CA actually changed, so toggling core
     * auto-updates does not disable plugin/theme auto-updates.
     *
     * @param  array<string, mixed>  $params  CA fields auto_update / auto_update_plugins / auto_update_themes
     */
    public function setAutoUpdate(Application $application, array $params): void
    {
        $api = $this->api($application);
        $current = $api->autoUpdate($application->engineProject());

        $mapped = [];
        if (isset($params['auto_update'])) {
            $core = $this->coreSetting(Payload::int($params['auto_update']) ?? 0);
            if ($core !== ($current['core'] ?? null)) {
                $mapped['core'] = $core;
            }
        }
        if (isset($params['auto_update_plugins'])) {
            $plugins = (Payload::int($params['auto_update_plugins']) ?? 0) === 1 ? 'on' : 'off';
            if ($plugins !== ($current['plugins'] ?? null)) {
                $mapped['plugins'] = $plugins;
            }
        }
        if (isset($params['auto_update_themes'])) {
            $themes = (Payload::int($params['auto_update_themes']) ?? 0) === 1 ? 'on' : 'off';
            if ($themes !== ($current['themes'] ?? null)) {
                $mapped['themes'] = $themes;
            }
        }

        if ($mapped !== []) {
            $api->setAutoUpdate($application->engineProject(), $mapped);
        }
    }

    private function coreSetting(int $value): string
    {
        return $value === 2 ? 'minor' : ($value === 1 ? 'on' : 'off');
    }

    /**
     * `wp plugin list` reads the database: a site whose core cannot be queried
     * (`no_config`, a database that is down) lists nothing, as the maintenance read.
     *
     * @return list<array<string, mixed>>
     */
    public function plugins(Application $application): array
    {
        $api = $this->api($application);
        if (! self::checkable($api->core($application->engineProject()))) {
            return [];
        }

        $plugins = $api->plugins($application->engineProject());
        $this->dropStalePluginStatuses($application, $plugins);

        return $this->plugins->presentList($application, $plugins);
    }

    /**
     * Old `PluginCollection::fromRemoteApp:56-64`: a plugin
     * status row whose plugin WordPress does not list is deleted unless its
     * operation is still pending or running – those rows stay and the
     * presenter shows them, so a failed install leaves no ghost behind.
     *
     * @param  list<array<string, mixed>>  $plugins  the Engine list
     */
    private function dropStalePluginStatuses(Application $application, array $plugins): void
    {
        WordPressAsyncStatus::query()
            ->where('application_id', $application->id)
            ->where('type', WordPressAsyncStatus::PLUGIN)
            ->whereNotIn('name', array_map(static fn (array $plugin): string => Payload::string($plugin['name'] ?? ''), $plugins))
            ->whereNotIn('status', [WordPressAsyncStatus::PENDING, WordPressAsyncStatus::IN_PROGRESS])
            ->delete();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function searchPlugins(Application $application, string $term): array
    {
        $api = $this->api($application);
        if (! self::checkable($api->core($application->engineProject()))) {
            return [];
        }

        $rows = $api->searchPlugins($application->engineProject(), $term);

        return array_map(fn (array $row): array => $this->plugins->presentSearch($row), $rows);
    }

    /**
     * `wp theme list` reads the database: same rule as {@see self::plugins()}.
     *
     * @return list<array<string, mixed>>
     */
    public function themes(Application $application): array
    {
        $api = $this->api($application);
        if (! self::checkable($api->core($application->engineProject()))) {
            return [];
        }

        return $this->themes->presentList($application, $api->themes($application->engineProject()));
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function searchThemes(Application $application, string $term): array
    {
        $api = $this->api($application);
        if (! self::checkable($api->core($application->engineProject()))) {
            return [];
        }

        $rows = $api->searchThemes($application->engineProject(), $term);

        return array_map(fn (array $row): array => $this->themes->presentSearch($row), $rows);
    }

    public function activatePlugin(Application $application, string $plugin): void
    {
        $this->api($application)->activatePlugin($application->engineProject(), $plugin);
    }

    public function deactivatePlugin(Application $application, string $plugin): void
    {
        $api = $this->api($application);

        // Old `PluginController::deactivate:138-142`: a plugin
        // missing from WordPress (e.g. a failed install) answers success and
        // drops its stale status row instead of failing in WP-CLI.
        if (! $this->pluginInstalled($api, $application, $plugin)) {
            $this->forgetPluginStatus($application, $plugin);

            return;
        }

        $api->deactivatePlugin($application->engineProject(), $plugin);
    }

    public function deletePlugin(Application $application, string $plugin): void
    {
        $api = $this->api($application);

        // Old `PluginController::destroy:222-231`: a plugin
        // missing from WordPress is not deleted again, and the plugin's status
        // row goes in both cases.
        if ($this->pluginInstalled($api, $application, $plugin)) {
            $api->deletePlugin($application->engineProject(), $plugin);
        }

        $this->forgetPluginStatus($application, $plugin);
    }

    /**
     * Whether WordPress has the plugin (`GET wp/plugins/{p}/installed`). Only
     * an explicit `installed: false` means missing; any other answer keeps
     * the WP-CLI call (the Engine answer is untrusted).
     */
    private function pluginInstalled(WordPressApi $api, Application $application, string $plugin): bool
    {
        return ($api->pluginInstalled($application->engineProject(), $plugin)['installed'] ?? null) !== false;
    }

    /**
     * Old `PluginController::deletePluginAsyncStatus:355-362`.
     */
    private function forgetPluginStatus(Application $application, string $plugin): void
    {
        WordPressAsyncStatus::query()
            ->where('application_id', $application->id)
            ->where('type', WordPressAsyncStatus::PLUGIN)
            ->where('name', $plugin)
            ->delete();
    }

    public function activateTheme(Application $application, string $theme): void
    {
        $this->api($application)->activateTheme($application->engineProject(), $theme);
    }

    public function deleteTheme(Application $application, string $theme): void
    {
        $api = $this->api($application);

        if ($this->activeTheme($api, $application) === $theme) {
            throw ValidationException::withMessages(['theme' => [self::ACTIVE_THEME_REFUSAL]]);
        }

        $api->deleteTheme($application->engineProject(), $theme);
    }

    /** The active theme from `wp theme list`; null when the list cannot be read. */
    private function activeTheme(WordPressApi $api, Application $application): ?string
    {
        try {
            if (! self::checkable($api->core($application->engineProject()))) {
                return null;
            }

            foreach ($api->themes($application->engineProject()) as $theme) {
                if (($theme['status'] ?? null) === 'active') {
                    return Payload::string($theme['name'] ?? null);
                }
            }
        } catch (EngineRequestException|EngineValidationException) {
            return null;
        }

        return null;
    }

    /**
     * Install a plugin/theme from a slug or a zip URL – queued, because the CA
     * shows a spinner and waits for a notification.
     *
     * @param  array<string, mixed>  $params  {slug} or {url}
     */
    public function installPlugin(Application $application, array $params): void
    {
        $name = Payload::string($params['slug'] ?? $params['url'] ?? null);
        $this->startAsync($application, WordPressAsyncStatus::PLUGIN, $name, 'install');

        RunWordPressActionJob::dispatch(
            $application->id,
            RunWordPressActionJob::PLUGIN_INSTALL,
            'user.instance.plugin.install_finished',
            'user.instance.plugin.install_failed',
            $params,
            WordPressAsyncStatus::PLUGIN,
            $name,
            'install',
        );
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function installTheme(Application $application, array $params): void
    {
        $name = Payload::string($params['slug'] ?? $params['url'] ?? null);
        $this->startAsync($application, WordPressAsyncStatus::THEME, $name, 'install');

        RunWordPressActionJob::dispatch(
            $application->id,
            RunWordPressActionJob::THEME_INSTALL,
            'user.instance.theme.install_finished',
            'user.instance.theme.install_failed',
            $params,
            WordPressAsyncStatus::THEME,
            $name,
            'install',
        );
    }

    public function updatePlugin(Application $application, string $plugin): void
    {
        $this->startAsync($application, WordPressAsyncStatus::PLUGIN, $plugin, 'update');

        // The notification's plugin row is built by the job from the Engine's
        // final state, never merged into the dispatch payload.
        RunWordPressActionJob::dispatch(
            $application->id,
            RunWordPressActionJob::PLUGIN_UPDATE,
            'user.instance.plugin.update_finished',
            'user.instance.plugin.update_failed',
            [],
            WordPressAsyncStatus::PLUGIN,
            $plugin,
            'update',
        );
    }

    public function updateTheme(Application $application, string $theme): void
    {
        $this->startAsync($application, WordPressAsyncStatus::THEME, $theme, 'update');

        RunWordPressActionJob::dispatch(
            $application->id,
            RunWordPressActionJob::THEME_UPDATE,
            'user.instance.theme.update_finished',
            'user.instance.theme.update_failed',
            [],
            WordPressAsyncStatus::THEME,
            $theme,
            'update',
        );
    }

    private function startAsync(Application $application, string $type, string $name, string $action): void
    {
        if ($name === '') {
            return;
        }

        WordPressAsyncStatus::query()->updateOrCreate(
            ['application_id' => $application->id, 'type' => $type, 'name' => $name],
            ['action' => $action, 'status' => WordPressAsyncStatus::PENDING],
        );
    }

    /**
     * Core update to a given version – queued.
     *
     * @param  array<string, mixed>  $params
     */
    public function updateCore(Application $application, array $params): void
    {
        $version = Payload::nullableString($params['version'] ?? null);

        // The dialog's backup box (docs "Updating WordPress"): the backup is
        // started here and the job waits for its task, so the update runs on a
        // copy it can be rolled back to. A project with no backup container is
        // refused before anything is queued.
        $backupTask = ($params['create_backup'] ?? false) === true
            ? $this->backupBeforeUpdate($application, $version)
            : null;

        // Old UpdateController::update: setAsyncStatus('update', 'pending') before
        // dispatching; the CA gates its "updating" spinner on
        // async_status.update (Instances.js:246). The Engine has no such key
        // (only staging/push/source) – the panel owns it.
        $this->startAsync($application, WordPressAsyncStatus::CORE, WordPressAsyncStatus::CORE, 'update');

        RunWordPressActionJob::dispatch(
            $application->id,
            RunWordPressActionJob::CORE_UPDATE,
            'user.instance.update_wordpress_finished',
            'user.instance.update_wordpress_failed',
            array_filter(['version' => $version], static fn ($v) => $v !== null && $v !== ''),
            WordPressAsyncStatus::CORE,
            WordPressAsyncStatus::CORE,
            'update',
            $backupTask,
        );
    }

    /**
     * The backup the update's checkbox asks for: files and databases, noted with
     * the version, so the Backups tab says what it was made for.
     *
     * @return int|null the Engine task that writes it
     */
    private function backupBeforeUpdate(Application $application, ?string $version): ?int
    {
        $note = $version === null || $version === ''
            ? 'Before the WordPress update'
            : "Before the WordPress update to {$version}";

        $backup = $this->backups->start($application, true, true, $note);

        return Payload::int(Payload::object($backup['async_status'] ?? null)['task_id'] ?? null);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function config(Application $application): array
    {
        $rows = $this->api($application)->config($application->engineProject());

        // A secret constant keeps its row and its type; only its value is
        // replaced, so the CA can offer the reveal instead of the value.
        return array_map(static function (array $row): array {
            if (! ProjectSecrets::isSecret(Payload::nullableString($row['name'] ?? null))) {
                return $row;
            }

            $row['value'] = ProjectSecrets::MASK;
            $row['secret'] = true;

            return $row;
        }, Payload::objects($rows));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function createConfig(Application $application, array $params): void
    {
        // Adding a constant is a PUT of one constant, never Engine `POST
        // wp/config` (which *creates* wp-config.php).
        $name = Payload::string($params['name'] ?? $params['constant'] ?? null);

        try {
            $this->api($application)->setConfig($application->engineProject(), $name, array_filter([
                'value' => $params['value'] ?? '',
                'type' => $params['type'] ?? null,
            ], static fn ($v) => $v !== null));
        } catch (EngineRequestException $e) {
            throw $this->configNameRefusal($e);
        }
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function setConfig(Application $application, string $constant, array $params): void
    {
        try {
            $this->api($application)->setConfig($application->engineProject(), $constant, $params);
        } catch (EngineRequestException $e) {
            throw $this->configNameRefusal($e);
        }
    }

    public function deleteConfig(Application $application, string $constant, ?string $type = null): void
    {
        try {
            $this->api($application)->deleteConfig($application->engineProject(), $constant, $type);
        } catch (EngineRequestException $e) {
            throw $this->configNameRefusal($e);
        }
    }

    /**
     * A name the Engine's `wp/config/{name}` route does not carry comes back as
     * a routing 405, which the CA shows on the name field, never as its text.
     * Every other Engine error stays as it is.
     */
    private function configNameRefusal(EngineRequestException $e): EngineRequestException|ValidationException
    {
        return $e->engineStatus === 405
            ? ValidationException::withMessages(['name' => [PhpIdentifier::REFUSAL]])
            : $e;
    }

    /**
     * @return list<array<string, mixed>>
     */
    /**
     * WP-CLI returns `ID`; the CA reads `id`.
     *
     * @return list<array<string, mixed>>
     */
    public function users(Application $application, ?string $role = null, ?int $onlyUserId = null): array
    {
        $rows = $this->api($application)->users($application->engineProject(), $role);
        if ($onlyUserId !== null) {
            $rows = array_values(array_filter(
                $rows,
                static fn (array $row): bool => Payload::int($row['ID'] ?? $row['id'] ?? null) === $onlyUserId,
            ));
        }

        // Old shape: packages/api/app/Http/Resources/User/Instance/Wordpress/UserResource.php:20-25.
        return array_map(static fn (array $row): array => [
            'id' => $row['ID'] ?? $row['id'] ?? null,
            'username' => $row['user_login'] ?? $row['login'] ?? null,
            'display_name' => $row['display_name'] ?? null,
            'email' => $row['user_email'] ?? $row['email'] ?? null,
            'role' => $row['roles'] ?? $row['role'] ?? [],
            'user_registered' => $row['user_registered'] ?? null,
        ], $rows);
    }

    /**
     * @param  array<string, mixed>  $params  CA field `username` (+ display_name, role, for_sso)
     */
    public function createUser(Application $application, array $params): void
    {
        $this->api($application)->createUser($application->engineProject(), array_filter([
            'login' => $params['username'] ?? $params['login'] ?? null,
            'email' => $params['email'] ?? null,
            'password' => $params['password'] ?? null,
            'role' => $params['role'] ?? null,
            'display_name' => $params['display_name'] ?? null,
            'send_email' => $params['send_email'] ?? null,
        ], static fn ($v) => $v !== null));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function updateUser(Application $application, string $user, array $params): void
    {
        // The CA's edit form leaves the password null to keep the current one
        // (old `!empty($params['password'])`); null is never sent.
        $this->api($application)->updateUser($application->engineProject(), $user, array_filter([
            'email' => $params['email'] ?? null,
            'display_name' => $params['display_name'] ?? null,
            'role' => $params['role'] ?? null,
            'password' => $params['password'] ?? null,
        ], static fn ($v) => $v !== null));
    }

    public function deleteUser(Application $application, string $user): void
    {
        $this->api($application)->deleteUser($application->engineProject(), $user);
    }

    /**
     * Reset a WordPress user's password. v1 generates one and returns it, as the
     * CA expects (the Engine needs a password rather than minting one).
     *
     * @return string the generated password
     */
    public function resetUserPassword(Application $application, string $user): string
    {
        $password = $this->generatePassword();

        $this->api($application)->setUserPassword($application->engineProject(), $user, $password);

        return $password;
    }

    /**
     * @return array<string, mixed>
     */
    public function userSsoUrl(Application $application, string $user): array
    {
        return $this->api($application)->userSso($application->engineProject(), $user);
    }

    public function setSiteName(Application $application, string $name): void
    {
        $this->api($application)->setOption($application->engineProject(), 'blogname', ['value' => $name]);

        // Panel-owned: the sync never overwrites `site_name`.
        $application->update(['site_name' => $name, 'name' => $name]);
    }

    public function clearCache(Application $application): void
    {
        $this->api($application)->flushCache($application->engineProject());
    }

    /**
     * @return array<string, mixed>
     */
    public function installationDetails(Application $application): array
    {
        $api = $this->api($application);

        $core = $api->core($application->engineProject());
        // One `GET wp/config` list – the debug flag is read from
        // the same answer, never a second request.
        $config = self::hasInstall($core) ? $this->configMap($application) : [];
        $installedIn = Payload::string($application->wordpressDirectory() ?? '');
        $directory = $this->domainDocumentRoot($application);

        return [
            'domain' => $application->domain,
            'url' => $application->url().($installedIn === '' ? '' : '/'.$installedIn),
            'version' => $core['version'] ?? null,
            // Panel-owned site name wins.
            'site_name' => $application->site_name
                ?? (self::checkable($core) ? $this->optionValue($api, $application, 'blogname') : null),
            // The document root is the main domain's detail, not a project one;
            // a subdirectory install sits below it.
            'directory' => $installedIn === '' || $directory === null
                ? $directory
                : rtrim($directory, '/').'/'.$installedIn,
            'database_name' => $config['DB_NAME'] ?? null,
            'database_user' => isset($config['DB_USER']) ? ProjectSecrets::MASK : null,
            'database_password' => isset($config['DB_PASSWORD']) ? ProjectSecrets::MASK : null,
            'database_host' => $config['DB_HOST'] ?? null,
            'redis_host' => null,
            'redis_port' => null,
            'redis_password' => null,
            'debug' => $this->enabled($config['WP_DEBUG'] ?? null) ? 'On' : 'Off',
        ];
    }

    /**
     * The project's main domain document root (`GET domains/{domain}`), or null
     * when the Engine does not report the domain.
     */
    private function domainDocumentRoot(Application $application): ?string
    {
        $domain = (string) $application->domain;
        if ($domain === '') {
            return null;
        }

        try {
            foreach ((new DomainsApi($application->engine()))->domains($application->engineProject()) as $candidate) {
                if (($candidate['domain'] ?? null) !== $domain) {
                    continue;
                }

                $details = Payload::object($candidate['details'] ?? null);

                return Payload::nullableString($details['document_root'] ?? null);
            }
        } catch (EngineException $e) {
            // A read-only detail; the rest of the page is still useful.
            report($e);
        }

        return null;
    }

    /**
     * A random password that satisfies the WordPress password policy.
     */
    private function generatePassword(): string
    {
        return \Illuminate\Support\Str::password(20);
    }

    /**
     * @return mixed
     */
    private function optionValue(WordPressApi $api, Application $application, string $option): mixed
    {
        $value = Payload::arrayOrString($api->option($application->engineProject(), $option));

        return is_array($value) ? ($value['value'] ?? null) : $value;
    }
}
