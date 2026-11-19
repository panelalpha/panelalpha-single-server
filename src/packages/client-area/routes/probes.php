<?php

/*
| Probe routes: moved verbatim out of the controller's api.php, hosting.php
| and domain_change.php into client-area-legacy and back (every certificate read is the Engine's `ssl-check`; the
| reachability probe is panel code). Mounted in the controller's
| `ClientAreaRoutes::group()`, so the `/api` prefix and middleware stack match;
| each route keeps its path, privilege and throttle, and its name follows the
| package (`client-area-legacy.*` → `client-area.*`).
|
| `{application}` is resolved by the controller's global route binding.
*/

use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Http\Controllers\Hosting\DomainProbeController;
use PanelAlpha\ClientArea\Http\Controllers\Project\InstanceSslController;

// The CA probes a candidate domain's certificate before install; registered
// under both spellings (`SuperQuickOnboardingMixin.js:72` builds `instances/...`).
Route::get('/projects/onboarding/ssl-certificate', [DomainProbeController::class, 'detectedSslCertificate'])
    ->middleware('throttle:outbound')
    ->name('client-area.projects.onboarding.ssl_certificate');
Route::get('/instances/onboarding/ssl-certificate', [DomainProbeController::class, 'detectedSslCertificate'])
    ->middleware('throttle:outbound')
    ->name('client-area.instances.onboarding.ssl_certificate');

// Onboarding domain step: whether the domain resolves to the Engine.
Route::get('/services/{service}/domains/resolve', [DomainProbeController::class, 'resolve'])
    ->whereNumber('service')
    ->middleware('throttle:outbound')
    ->name('client-area.hosting.services.domains.resolve');

// The certificate a project domain really serves (Engine `ssl-check`), with its verdict.
Route::prefix('server-accounts/{application}')
    ->whereNumber('application')
    ->group(function (): void {
        Route::get('/ssl/certificate/detected', [DomainProbeController::class, 'detectedSslCert'])
            ->middleware('throttle:ssl-check')
            ->name('client-area.hosting.ssl.detected');
    });

Route::get('/projects/{application}/ssl/certificate/detected-by-url', [InstanceSslController::class, 'detectedByUrl'])
    ->whereNumber('application')
    ->middleware('throttle:ssl-check')
    ->name('client-area.projects.ssl.detected_by_url');
Route::get('/instances/{application}/ssl/certificate/detected-by-url', [InstanceSslController::class, 'detectedByUrl'])
    ->whereNumber('application')
    ->middleware('throttle:ssl-check')
    ->name('client-area.instances.ssl.detected_by_url');
