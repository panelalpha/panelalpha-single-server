<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine WordPress endpoints for one project, branch
 * `origin/feat/wordpress` (`[wp]`). Thin and stateless; all Engine paths for
 * this area live here.
 *
 * Most `wp/*` calls are synchronous (one WP-CLI run), but the CA treats plugin/
 * theme/core install & update as async → the service queues them.
 */
final class WordPressApi
{
    /**
     * The wordpress.org plugin fields the CA reads on a search row
     * (`NewPluginCard.vue:16,34,52,58,84` and the install action
     * `PluginsActionsMixin.js:38`): slug, name, rating, active_installs, tested,
     * version, short_description/description. The old panel asked for the same
     * list (`AbstractPlugins::search`, `--fields=name,version,slug,…`); the
     * Engine's default (`name,slug,rating`) would drop the rest.
     */
    private const PLUGIN_SEARCH_FIELDS = 'name,version,slug,rating,last_updated,requires,tested,active_installs,short_description,description,icons';

    /**
     * The wordpress.org theme fields the CA reads on a search row
     * (`NewThemeCard.vue:67,75,79,94,109,126-128`): slug, name, description,
     * rating, preview_url/screenshot_url, version. The old panel asked for the
     * same list (`AbstractThemes::search`).
     */
    private const THEME_SEARCH_FIELDS = 'name,version,slug,rating,screenshot_url,preview_url,description';

    /**
     * The installed plugin/theme fields the CA reads on a list row: the
     * Engine's default (`name,status,update,version,update_version,auto_update`,
     * `WpPluginController::index`) has no `title` or `description`, so the CA
     * showed the slug and no description; the old panel listed both
     * (`AbstractPlugins::getList`). Engine `fields` (`WpPluginListRequest`,
     * `WpThemeListRequest`) passes them to `wp plugin|theme list --fields`.
     */
    public const LIST_FIELDS = 'name,title,status,update,version,update_version,auto_update,description';

    /**
     * `$path` is the install's directory in the project home, when the panel
     * knows it: the Engine's `wp/*` endpoints read the main domain's document
     * root otherwise, so a WordPress installed into a subdirectory would not be
     * found there. `null` keeps every call on the default document root.
     */
    public function __construct(EngineClient $engine, ?string $path = null)
    {
        $this->engine = $path === null || $path === '' ? $engine : $engine->withQuery(['path' => $path]);
    }

    private readonly EngineClient $engine;

    /**
     * Core status: `{installed: bool, version: string|null}`
     * (Engine: core/routes/api.php:296 → WpCoreController::status; a fatal
     * site-load is a 422, "no install" is a 200 with installed=false).
     *
     * `$skipPlugins` runs WP-CLI with --skip-plugins --skip-themes so a broken
     * plugin does not turn a real install into a failure.
     *
     * @return array<string, mixed>
     */
    public function core(EngineProject $project, bool $skipPlugins = true): array
    {
        $query = $skipPlugins ? ['skip_plugins' => 1] : [];

        return Payload::object($this->engine->get($project->enginePath('wp/core'), $query)->json('data'));
    }

    /**
     * `POST wp/search-replace` – `wp search-replace {search} {replacement}` plus
     * optional extra WP-CLI args. Engine `core/routes/api.php:318` →
     * `WpSearchReplaceController::run` / `WpSearchReplaceRequest`; envelope
     * `{data:{search,replacement,message}}`; a non-zero WP-CLI exit is a 422.
     * A dedicated endpoint, never the generic `wp/command`.
     *
     * @param  list<string>  $args
     * @return array<string, mixed>
     */
    public function searchReplace(EngineProject $project, string $search, string $replacement, array $args = []): array
    {
        return Payload::object($this->engine->post($project->enginePath('wp/search-replace'), array_filter([
            'search' => $search,
            'replacement' => $replacement,
            'args' => $args,
        ], static fn (mixed $value): bool => $value !== []))->json('data'));
    }

    /**
     * @return array<string, mixed>
     */
    public function coreUpdates(EngineProject $project): array
    {
        return Payload::object($this->engine->get($project->enginePath('wp/core/updates'), ['skip_plugins' => 1])->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function coreUpdate(EngineProject $project, array $params): Response
    {
        return $this->engine->post($project->enginePath('wp/core/update'), $params);
    }

    /**
     * `wp core download` into the install directory (Engine 2.2.0
     * `2a6313e9e`): `{locale?, version?, path?}` → `{data:{version, locale,
     * path}}`; 409 when core files are already there, 422 on a container
     * project or a bad locale/version (`WpCoreController::download`).
     *
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function coreDownload(EngineProject $project, array $params): array
    {
        return Payload::object($this->engine->post($project->enginePath('wp/core/download'), $params)->json('data'));
    }

    /**
     * Create wp-config.php (`POST wp/config`, `WpConfigCreateRequest`:
     * dbname, dbuser, dbpass, dbhost, dbprefix, locale, force, path). Adding a
     * constant to an existing file is {@see setConfig()}.
     *
     * @param  array<string, mixed>  $params
     */
    public function createConfig(EngineProject $project, array $params): Response
    {
        return $this->engine->post($project->enginePath('wp/config'), $params);
    }

    /**
     * Install and activate a core language (`PUT wp/language {language, path?}`).
     *
     * @param  array<string, mixed>  $params
     */
    public function setLanguage(EngineProject $project, array $params): Response
    {
        return $this->engine->put($project->enginePath('wp/language'), $params);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function coreInstall(EngineProject $project, array $params): Response
    {
        return $this->engine->post($project->enginePath('wp/core/install'), $params);
    }

    /**
     * @return array<string, mixed>
     */
    public function maintenance(EngineProject $project): array
    {
        return Payload::object($this->engine->get($project->enginePath('wp/maintenance'), ['skip_plugins' => 1])->json('data'));
    }

    public function setMaintenance(EngineProject $project, bool $enabled): Response
    {
        return $this->engine->put($project->enginePath('wp/maintenance'), ['enabled' => $enabled]);
    }

    public function flushCache(EngineProject $project): Response
    {
        return $this->engine->post($project->enginePath('wp/cache/flush'));
    }

    /**
     * @return array<string, mixed>
     */
    public function config(EngineProject $project): array
    {
        // `type=all` lists constants and variables; `skip_plugins=1`
        // keeps a broken plugin from turning the listing into a 422.
        return Payload::object($this->engine->get($project->enginePath('wp/config'), ['type' => 'all', 'skip_plugins' => 1])->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function setConfig(EngineProject $project, string $constant, array $params): Response
    {
        return $this->engine->put($project->enginePath('wp/config/'.rawurlencode($constant)), $params);
    }

    public function deleteConfig(EngineProject $project, string $constant, ?string $type = null): Response
    {
        return $this->engine->delete(
            $project->enginePath('wp/config/'.rawurlencode($constant)),
            $type !== null ? ['type' => $type] : [],
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function autoUpdate(EngineProject $project): array
    {
        return Payload::object($this->engine->get($project->enginePath('wp/auto-update'), ['skip_plugins' => 1])->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function setAutoUpdate(EngineProject $project, array $params): Response
    {
        return $this->engine->put($project->enginePath('wp/auto-update'), $params);
    }

    /**
     * @return mixed
     */
    public function option(EngineProject $project, string $option): mixed
    {
        return $this->engine->get($project->enginePath('wp/options/'.rawurlencode($option)), ['skip_plugins' => 1])->json('data');
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function setOption(EngineProject $project, string $option, array $params): Response
    {
        return $this->engine->put($project->enginePath('wp/options/'.rawurlencode($option)), $params);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function plugins(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('wp/plugins'), ['fields' => self::LIST_FIELDS, 'skip_plugins' => 1])->json('data'));
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function searchPlugins(EngineProject $project, string $term): array
    {
        return Payload::objects($this->engine->get($project->enginePath('wp/plugins/search'), [
            'term' => $term,
            'fields' => self::PLUGIN_SEARCH_FIELDS,
            'skip_plugins' => 1,
        ])->json('data'));
    }

    /**
     * @return array<string, mixed>
     */
    public function plugin(EngineProject $project, string $plugin): array
    {
        return Payload::object($this->engine->get($project->enginePath('wp/plugins/'.rawurlencode($plugin)), ['skip_plugins' => 1])->json('data'));
    }

    /**
     * WP-CLI `plugin is-installed`: `{plugin, installed}` (Engine
     * `core/routes/api.php:268` → `WpPluginController::installed`; a site that
     * fails to load is a 422, never `installed: false`).
     *
     * @return array<string, mixed>
     */
    public function pluginInstalled(EngineProject $project, string $plugin): array
    {
        return Payload::object($this->engine->get($project->enginePath('wp/plugins/'.rawurlencode($plugin).'/installed'), ['skip_plugins' => 1])->json('data'));
    }

    public function activatePlugin(EngineProject $project, string $plugin): Response
    {
        return $this->engine->post($project->enginePath('wp/plugins/'.rawurlencode($plugin).'/activate'));
    }

    public function deactivatePlugin(EngineProject $project, string $plugin): Response
    {
        return $this->engine->post($project->enginePath('wp/plugins/'.rawurlencode($plugin).'/deactivate'));
    }

    public function updatePlugin(EngineProject $project, string $plugin): Response
    {
        return $this->engine->post($project->enginePath('wp/plugins/'.rawurlencode($plugin).'/update'));
    }

    public function deletePlugin(EngineProject $project, string $plugin): Response
    {
        return $this->engine->delete($project->enginePath('wp/plugins/'.rawurlencode($plugin)));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function installPlugin(EngineProject $project, array $params): Response
    {
        return $this->engine->post($project->enginePath('wp/plugins/install'), $params);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function themes(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('wp/themes'), ['fields' => self::LIST_FIELDS, 'skip_plugins' => 1])->json('data'));
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function searchThemes(EngineProject $project, string $term): array
    {
        return Payload::objects($this->engine->get($project->enginePath('wp/themes/search'), [
            'term' => $term,
            'fields' => self::THEME_SEARCH_FIELDS,
            'skip_plugins' => 1,
        ])->json('data'));
    }

    /**
     * WP-CLI `theme is-installed`: `{theme, installed}` (Engine
     * `core/routes/api.php:300` → `WpThemeController::installed`; a site that
     * fails to load is a 422, never `installed: false`).
     *
     * @return array<string, mixed>
     */
    public function themeInstalled(EngineProject $project, string $theme): array
    {
        return Payload::object($this->engine->get($project->enginePath('wp/themes/'.rawurlencode($theme).'/installed'), ['skip_plugins' => 1])->json('data'));
    }

    public function activateTheme(EngineProject $project, string $theme): Response
    {
        return $this->engine->post($project->enginePath('wp/themes/'.rawurlencode($theme).'/activate'));
    }

    public function updateTheme(EngineProject $project, string $theme): Response
    {
        return $this->engine->post($project->enginePath('wp/themes/'.rawurlencode($theme).'/update'));
    }

    public function deleteTheme(EngineProject $project, string $theme): Response
    {
        return $this->engine->delete($project->enginePath('wp/themes/'.rawurlencode($theme)));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function installTheme(EngineProject $project, array $params): Response
    {
        return $this->engine->post($project->enginePath('wp/themes/install'), $params);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function users(EngineProject $project, ?string $role = null): array
    {
        return Payload::objects($this->engine->get($project->enginePath('wp/users'), array_filter([
            'skip_plugins' => 1,
            'role' => $role,
        ], static fn ($v) => $v !== null && $v !== ''))->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params  {login, email, password, role…}
     * @return array<string, mixed>
     */
    public function createUser(EngineProject $project, array $params): array
    {
        return Payload::object($this->engine->post($project->enginePath('wp/users'), $params)->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function updateUser(EngineProject $project, string $user, array $params): array
    {
        return Payload::object($this->engine->put($project->enginePath('wp/users/'.rawurlencode($user)), $params)->json('data'));
    }

    public function deleteUser(EngineProject $project, string $user): Response
    {
        return $this->engine->delete($project->enginePath('wp/users/'.rawurlencode($user)));
    }

    /**
     * @return array<string, mixed>
     */
    public function setUserPassword(EngineProject $project, string $user, string $password): array
    {
        return Payload::object($this->engine->put($project->enginePath('wp/users/'.rawurlencode($user).'/password'), [
            'password' => $password,
        ])->json('data'));
    }

    /**
     * @return array<string, mixed>
     */
    public function userSso(EngineProject $project, string $user): array
    {
        return Payload::object($this->engine->post($project->enginePath('wp/users/'.rawurlencode($user).'/sso'))->json('data'));
    }
}
