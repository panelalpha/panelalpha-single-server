<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PanelAlpha\ClientArea\Http\Requests\Project\WordPress\AutoUpdateRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\WordPress\CoreUpdateRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\WordPress\InstallAssetRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\WordPress\SiteNameRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\WordPress\ToggleStatusRequest;
use PanelAlpha\ClientArea\Contracts\WordPressSsoRestriction;
use PanelAlpha\ClientArea\Http\Requests\Project\WordPress\UserSsoRequest;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Http\Middleware\LogSecretReveal;
use PanelAlpha\ClientArea\Http\Requests\WordPress\SecretRevealRequest;
use PanelAlpha\ClientArea\Http\Requests\WordPress\WordPressConfigCreateRequest;
use PanelAlpha\ClientArea\Http\Requests\WordPress\WordPressConfigDeleteRequest;
use PanelAlpha\ClientArea\Http\Requests\WordPress\WordPressConfigSetRequest;
use PanelAlpha\ClientArea\Http\Requests\WordPress\WordPressUserRequest;
use PanelAlpha\ClientArea\Http\Requests\WordPress\WordPressUserUpdateRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectSecrets;
use PanelAlpha\ClientArea\Projects\ProjectWordPressDetails;
use PanelAlpha\ClientArea\Projects\WordPressService;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * WordPress management for a project, backed by the
 * Engine `[wp]` endpoints. Reads and the simple settings keep their old
 * `wordpress.*` privileges.
 */
final class WordPressController extends Controller
{
    public function __construct(
        private readonly WordPressService $wordpress,
        private readonly WordPressSsoRestriction $ssoRestriction,
        private readonly ProjectSecrets $secrets,
        private readonly ProjectWordPressDetails $wordpressDetails,
    )
    {
        // WordPress endpoints require a detected WordPress project
        //The CA hides them otherwise.
        $this->middleware(function (Request $request, \Closure $next) {
            $application = $request->route('application');
            if ($application instanceof Application && $application->type !== Application::TYPE_WORDPRESS) {
                abort(422, 'This project is not a WordPress installation.');
            }

            return $next($request);
        });
    }

    public function updates(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->wordpress->updates($application)]);
    }

    public function maintenanceMode(Application $application): JsonResponse
    {
        return response()->json($this->wordpress->maintenance($application));
    }

    public function setMaintenanceMode(ToggleStatusRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();
        $this->wordpress->setMaintenance($application, (bool) $params['status']);

        return response()->json(['success' => true]);
    }

    public function debugMode(Application $application): JsonResponse
    {
        return response()->json($this->wordpress->debugMode($application));
    }

    public function setDebugMode(ToggleStatusRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();
        $this->wordpress->setDebugMode($application, (bool) $params['status']);

        return response()->json(['success' => true]);
    }

    public function searchEngineIndexing(Application $application): JsonResponse
    {
        return response()->json($this->wordpress->searchEngineIndexing($application));
    }

    public function setSearchEngineIndexing(ToggleStatusRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();
        $this->wordpress->setSearchEngineIndexing($application, (bool) $params['status']);

        return response()->json(['success' => true]);
    }

    public function autoUpdate(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->wordpress->autoUpdate($application)]);
    }

    public function setAutoUpdate(AutoUpdateRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();
        $this->wordpress->setAutoUpdate($application, $params);

        return response()->json(['success' => true]);
    }

    public function plugins(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->wordpress->plugins($application)]);
    }

    public function searchPlugins(Application $application, string $term): JsonResponse
    {
        return response()->json(['data' => $this->wordpress->searchPlugins($application, $term)]);
    }

    public function themes(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->wordpress->themes($application)]);
    }

    public function searchThemes(Application $application, string $term): JsonResponse
    {
        return response()->json(['data' => $this->wordpress->searchThemes($application, $term)]);
    }

    public function setSiteName(SiteNameRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();
        $this->wordpress->setSiteName($application, Payload::string($params['name'] ?? ''));

        return response()->json(['success' => true]);
    }

    public function clearCache(Application $application): JsonResponse
    {
        $this->wordpress->clearCache($application);

        return response()->json(['success' => true]);
    }

    public function installationDetails(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->wordpress->installationDetails($application)]);
    }

    /**
     * POST /projects/{id}/secrets/reveal: the value of one masked wp-config
     * secret, for this one answer only. The route confirms the password first
     * and its middleware logs every request, granted or refused.
     */
    public function revealSecret(SecretRevealRequest $request, Application $application): JsonResponse
    {
        $secret = Payload::string($request->validated()['secret'] ?? '');

        // The granted entry of the project's log; a refusal is recorded by the
        // route's `log-secret-reveal` middleware. A FormRequest copies the
        // attribute bag, so the payload goes on the canonical request.
        request()->attributes->set('activity', LogSecretReveal::grantedPayload(request()));

        return response()->json(['data' => [
            'secret' => $secret,
            'value' => $this->secrets->reveal($application, $secret),
        ]]);
    }

    // Plugins -------------------------------------------------------------

    public function activatePlugin(Application $application, string $plugin): JsonResponse
    {
        $this->wordpress->activatePlugin($application, $plugin);

        return response()->json(['success' => true]);
    }

    public function deactivatePlugin(Application $application, string $plugin): JsonResponse
    {
        $this->wordpress->deactivatePlugin($application, $plugin);

        return response()->json(['success' => true]);
    }

    public function deletePlugin(Application $application, string $plugin): JsonResponse
    {
        $this->wordpress->deletePlugin($application, $plugin);

        // The old `PluginController::destroy` returned the refreshed plugin
        // list; the CA feeds `response.data.data` straight into its table
        // (PluginsActionsMixin.js:516-524).
        $plugins = $this->wordpress->plugins($application);
        $this->wordpressDetails->pluginsChanged($application, $plugins);

        return response()->json(['data' => $plugins]);
    }

    public function updatePlugin(Application $application, string $plugin): JsonResponse
    {
        $this->wordpress->updatePlugin($application, $plugin);

        return response()->json(['success' => true], 202);
    }

    public function installPlugin(InstallAssetRequest $request, Application $application, string $name): JsonResponse
    {
        $params = array_merge(['slug' => $name], $request->validated());

        $this->wordpress->installPlugin($application, $params);

        return response()->json(['success' => true], 202);
    }

    /**
     * GET /projects/{application}/wordpress/themes/{theme}/screenshot – the
     * theme's screenshot, or the placeholder the old panel served when it ships
     * none. The CA builds this URL by hand for an `<img>`, so an `/instances`
     * alias exists (old ThemeController::screenshot).
     */
    public function themeScreenshot(Application $application, string $theme): Response
    {
        $shot = $this->wordpress->themeScreenshot($application, $theme);

        if ($shot === null) {
            // 1x1 transparent GIF, the old panel's "preview not available".
            $gif = (string) hex2bin('4749463839610100010000000021f90401000000002c00000000010001000002010000');

            return response($gif, 200, [
                'Content-Type' => 'image/gif',
                'Cache-Control' => 'private, max-age=604800',
            ]);
        }

        /** @var int<100, 599> $status */
        $status = $shot->status();

        return response($shot->body(), $status, array_filter([
            'Content-Type' => $shot->header('Content-Type') ?: null,
            'Cache-Control' => 'private, max-age=604800',
        ]));
    }

    // Themes --------------------------------------------------------------

    public function activateTheme(Application $application, string $theme): JsonResponse
    {
        $this->wordpress->activateTheme($application, $theme);

        return response()->json(['success' => true]);
    }

    public function deleteTheme(Application $application, string $theme): JsonResponse
    {
        $this->wordpress->deleteTheme($application, $theme);

        return response()->json(['success' => true]);
    }

    public function updateTheme(Application $application, string $theme): JsonResponse
    {
        $this->wordpress->updateTheme($application, $theme);

        return response()->json(['success' => true], 202);
    }

    public function installTheme(InstallAssetRequest $request, Application $application, string $name): JsonResponse
    {
        $params = array_merge(['slug' => $name], $request->validated());

        $this->wordpress->installTheme($application, $params);

        return response()->json(['success' => true], 202);
    }

    // Core ----------------------------------------------------------------

    public function updateCore(CoreUpdateRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();

        $this->wordpress->updateCore($application, $params);

        return response()->json(['success' => true], 202);
    }

    // Config --------------------------------------------------------------

    public function config(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->wordpress->config($application)]);
    }

    public function createConfig(WordPressConfigCreateRequest $request, Application $application): JsonResponse
    {
        $this->wordpress->createConfig($application, $request->validated());

        return response()->json(['success' => true]);
    }

    public function setConfig(WordPressConfigSetRequest $request, Application $application, string $name): JsonResponse
    {
        $this->wordpress->setConfig($application, $name, $request->validated());

        return response()->json(['success' => true]);
    }

    public function deleteConfig(WordPressConfigDeleteRequest $request, Application $application, string $name): JsonResponse
    {
        // Old `ConfigController::destroy`: `type` is required and must be one of
        // constant/variable; the CA sends it in the DELETE body
        // (ConfigActionsMixin.js:41-45).
        $this->wordpress->deleteConfig($application, $name, Payload::string($request->validated()['type'] ?? ''));

        return response()->json(['success' => true]);
    }

    /**
     * GET /projects/{id}/wordpress/plugins/new/featured (old
     * `showFromPackagesList`): the plugins of the admin's packages for the
     * project's plan and service that the project does not have; Community has no
     * packages, so it is empty – the CA shows no featured
     * cards.
     */
    public function featuredPlugins(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->wordpress->featuredPlugins($application)]);
    }

    /**
     * GET /projects/{id}/wordpress/themes/new/featured (old
     * `ThemeController::showFromPackagesList`), as the plugins.
     */
    public function featuredThemes(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->wordpress->featuredThemes($application)]);
    }

    // Users ---------------------------------------------------------------

    public function users(Request $request, Application $application): JsonResponse
    {
        // The old UserController::index accepts `role`/`for_sso` filters. The
        // Engine has no `for_sso`: the SSO picker of a user limited to one
        // WordPress user lists only that user, panel-side (old
        // UserController.php:71-81).
        $role = $request->query('role');
        $forSso = filter_var($request->query('for_sso', false), FILTER_VALIDATE_BOOLEAN);
        $user = $request->user();
        $only = $forSso && $user !== null ? $this->ssoRestriction->wordPressUserIdFor($user, $application) : null;

        return response()->json(['data' => $this->wordpress->users(
            $application,
            is_string($role) && $role !== '' ? $role : null,
            $only,
        )]);
    }

    public function createUser(WordPressUserRequest $request, Application $application): JsonResponse
    {
        $this->wordpress->createUser($application, $request->validated());

        return response()->json(['success' => true]);
    }

    public function updateUser(WordPressUserUpdateRequest $request, Application $application, string $userId): JsonResponse
    {
        $this->wordpress->updateUser($application, $userId, $request->validated());

        return response()->json(['success' => true]);
    }

    public function deleteUser(Application $application, string $userId): JsonResponse
    {
        $this->wordpress->deleteUser($application, $userId);

        return response()->json(['success' => true]);
    }

    public function resetUserPassword(Application $application, string $userId): JsonResponse
    {
        $password = $this->wordpress->resetUserPassword($application, $userId);

        return response()->json(['success' => true, 'new_password' => $password]);
    }

    public function userSsoUrl(UserSsoRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();
        $result = $this->wordpress->userSsoUrl($application, Payload::string($params['user'] ?? ''));

        return response()->json(['data' => ['sso_url' => $result['url'] ?? $result['sso_url'] ?? null]]);
    }
}
