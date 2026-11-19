<?php

namespace PanelAlpha\ClientArea\Contracts;

use PanelAlpha\ClientArea\Models\Application;

/**
 * The featured plugins and themes of a project's "Add new" pages (old
 * `PluginController::showFromPackagesList()` and
 * `ThemeController::showFromPackagesList()`,
 * packages/api/app/Http/Controllers/User/Instance/Wordpress/PluginController.php:337-353,
 * ThemeController.php:382-400): the items of the admin's packages on the
 * project's plan and service, in the old `DatabasePluginResource` /
 * `DatabaseThemeResource` shape (`router/fetchData.js:168-176`, :209-217).
 * Each item carries its wordpress.org `slug`; the controller leaves out the
 * ones the project already has.
 *
 * Community has no admin catalog: the controller's default lists nothing, and the
 * controller then asks the Engine nothing; the paid Admin Area binds the
 * packages' answer.
 */
interface ProjectFeaturedItems
{
    /**
     * @return list<array<string, mixed>>
     */
    public function plugins(Application $application): array;

    /**
     * @return list<array<string, mixed>>
     */
    public function themes(Application $application): array;
}
