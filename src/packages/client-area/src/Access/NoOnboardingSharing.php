<?php

namespace PanelAlpha\ClientArea\Access;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Contracts\OnboardingSharing;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Community's answer: a single user shares with nobody, so the onboarding's
 * `shared_access` stays validated by the requests and ignored, as it always was
 * in Community.
 */
final class NoOnboardingSharing implements OnboardingSharing
{
    public function assertShareable(Authenticatable $owner, array $emails): void {}

    public function share(Authenticatable $owner, Application $application, array $emails): void {}
}
