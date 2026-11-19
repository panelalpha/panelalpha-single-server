<?php

/*
| Onboarding catalog routes: moved verbatim out of the
| controller's api.php into client-area-legacy and back. Mounted in the controller's `ClientAreaRoutes::group()`, so
| the `/api` prefix and middleware stack match; each route keeps its path, and
| its name follows the package (`client-area-legacy.*` → `client-area.*`).
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Project\OnboardingCatalogController;

// The WordPress versions the onboarding form offers; the CA builds
// `/instances/wordpress-versions`, so both spellings are registered. A fixed
// third-party host (api.wordpress.org), throttled like the old route: not at
// all.
Route::get('/projects/wordpress-versions', [OnboardingCatalogController::class, 'wordpressVersions'])
    ->name('client-area.projects.wordpress_versions');
Route::get('/instances/wordpress-versions', [OnboardingCatalogController::class, 'wordpressVersions'])
    ->name('client-area.instances.wordpress_versions');

// The onboarding theme browser; the CA builds `/instances/onboarding/themes`.
// Fixed wordpress.org host – no `throttle:outbound`.
Route::get('/projects/onboarding/themes', [OnboardingCatalogController::class, 'themes'])
    ->name('client-area.projects.onboarding.themes');
Route::get('/instances/onboarding/themes', [OnboardingCatalogController::class, 'themes'])
    ->name('client-area.instances.onboarding.themes');
