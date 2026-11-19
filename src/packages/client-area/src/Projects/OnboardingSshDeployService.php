<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Provisioning\ProvisionRequest;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The wizard's "Generate key" step for a private Git repository over SSH:
 * create the container project without a repository, or
 * reuse the one the domain step created, and hand back its deploy key so the
 * customer can add it on the forge while the create task still runs. The
 * connect and the deploy are the project's own `git/connect` and `git/deploy`.
 */
final class OnboardingSshDeployService
{
    public function __construct(
        private readonly ApplicationRepository $applications,
        private readonly ApplicationProvisioner $provisioner,
        private readonly GitDeployKeyService $deployKeys,
        private readonly DeployState $deployState,
    ) {}

    /**
     * @param  array<string, mixed>  $params  validated ProjectDeployKeyRequest body
     * @return array{application: Application, deploy_key: array{public_key: string, fingerprint: string, created: bool}}
     *
     * @throws ValidationException a non-SSH or blocked `repo_url`, a foreign
     *                             project, a concurrent deploy or a project that
     *                             already has a git source
     */
    public function create(Authenticatable $user, array $params): array
    {
        $repoUrl = Payload::string($params['repo_url'] ?? null);

        // Fail on the address before a project is created for it: the host is
        // guarded and the URL must be SSH (422 on `repo_url` otherwise).
        $this->deployKeys->pinHost($repoUrl);

        $domainId = Payload::int($params['domain_id'] ?? null);
        if ($domainId === null || $domainId <= 0) {
            $result = $this->provisioner->provision($user, new ProvisionRequest(
                template: 'dind',
                serviceId: Payload::int($params['service_id'] ?? null),
            ));

            return $this->withKey($result->application, $repoUrl);
        }

        $application = $this->applications->findForUser($user, $domainId);

        // The same per-application lock as the other onboarding deploys, so a
        // key request cannot interleave with a deploy starting on the project.
        $lock = Cache::lock(
            OnboardingDeployService::deployLockKey($application->id),
            OnboardingDeployService::deployLockSeconds(),
        );
        if (! $lock->get()) {
            throw ValidationException::withMessages([
                'domain_id' => ['A deploy is already starting for this project. Try again in a moment.'],
            ]);
        }

        try {
            $application = $application->refresh();

            if ($application->gitRepositoryUrl() !== null || $this->deployState->hasGitInstall($application)) {
                throw ValidationException::withMessages([
                    'domain_id' => ['This project already has a Git repository. Use its Git tab instead.'],
                ]);
            }

            return $this->withKey($application, $repoUrl);
        } finally {
            $lock->release();
        }
    }

    /**
     * @return array{application: Application, deploy_key: array{public_key: string, fingerprint: string, created: bool}}
     */
    private function withKey(Application $application, string $repoUrl): array
    {
        $key = $this->deployKeys->show($application, $repoUrl);

        return [
            'application' => $application,
            'deploy_key' => [
                'public_key' => $key['public_key'],
                'fingerprint' => $key['fingerprint'],
                'created' => $key['created'],
            ],
        ];
    }
}
