<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Models\Application;

/**
 * The onboarding's own `shared_access` field: the emails
 * the install, deploy, deploy-key and import requests list
 * (`OnboardingModalWrapper.vue:766`, :1078, :1762, :1935,
 * `OnboardingDeployFromGitModal.vue:349`) get the new project shared with
 * them, as the old `InstanceController::install()`/`deploy()` and
 * `ImportController::importWordpress()` did
 * (packages/api/app/Http/Controllers/User/InstanceController.php:472-486,
 * :2061-2078, Instance/ImportController.php:500-514).
 *
 * The onboarding controllers call {@see self::assertShareable()} before their
 * service creates or changes anything – a refusal answers before the project
 * exists – and {@see self::share()} once the project row exists. Community has no
 * shared access: the controller's default validates nothing and shares
 * nothing; an edition with shared access binds its own.
 */
interface OnboardingSharing
{
    /**
     * @param  list<string>  $emails
     *
     * @throws ValidationException an email the owner may not share the project with
     */
    public function assertShareable(Authenticatable $owner, array $emails): void;

    /**
     * @param  list<string>  $emails
     */
    public function share(Authenticatable $owner, Application $application, array $emails): void;
}
