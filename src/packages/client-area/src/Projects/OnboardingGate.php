<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\OnboardingSharing;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Contracts\ServiceOnboarding;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Services\HostingService;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * What the onboarding's create requests (install, deploy, deploy-key, the
 * WordPress import) check against the user's service before they start, and
 * the shares they make once the project exists: one of the
 * user's services (else 404), the plan's project types (old
 * `Plan::assertAllowsInstallationType()` / `assertAllowsMigrations()`,
 * packages/api/app/Models/Plan.php:1941-1963) and the onboarding's
 * `shared_access` ({@see OnboardingSharing}). Community's answers allow every type
 * and share nothing.
 */
final class OnboardingGate
{
    /** Old `api/custom_validation.project_type_not_allowed` (custom_validation.php:104). */
    public const string TYPE_NOT_ALLOWED = 'This project type is not allowed on the selected plan.';

    public function __construct(
        private readonly ServiceDirectory $services,
        private readonly ServiceOnboarding $onboarding,
        private readonly OnboardingSharing $sharing,
    ) {}

    /**
     * One of the user's services, or 404 (Community: only the virtual service).
     */
    public function service(Authenticatable $user, int $serviceId): HostingService
    {
        $service = $this->services->findForUser($user, $serviceId);
        abort_if($service === null, 404);

        return $service;
    }

    /**
     * The old 422 (no field key) for a project type the plan does not allow.
     *
     * @param  ServiceOnboarding::TYPE_*  $type
     *
     * @throws ValidationException
     */
    public function assertProjectType(HostingService $service, string $type): void
    {
        if (! $this->onboarding->allowsProjectType($service, $type)) {
            throw ValidationException::withMessages([self::TYPE_NOT_ALLOWED]);
        }
    }

    /**
     * The request's `shared_access` emails, checked before anything is
     * created.
     *
     * @param  array<string, mixed>  $params  the validated request
     * @return list<string>
     *
     * @throws ValidationException
     */
    public function shares(Authenticatable $user, array $params): array
    {
        $emails = Payload::strings($params['shared_access'] ?? null);
        if ($emails !== []) {
            $this->sharing->assertShareable($user, $emails);
        }

        return $emails;
    }

    /**
     * Share the project the request created or set up with the emails
     * {@see self::shares()} accepted.
     *
     * @param  list<string>  $emails
     */
    public function share(Authenticatable $user, Application $application, array $emails): void
    {
        if ($emails !== []) {
            $this->sharing->share($user, $application, $emails);
        }
    }
}
