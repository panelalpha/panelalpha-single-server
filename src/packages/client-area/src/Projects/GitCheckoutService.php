<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Cache\Lock as CacheLock;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\EnvFileParser;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Sync\ApplicationSynchronizer;
use PanelAlpha\EngineClient\Api\EnvVarsApi;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;

/**
 * What the wizard needs from a connected checkout once the repository is
 * connected over SSH (git-deploy-keys): the `.env.example` preview for the
 * env-vars step and the first deploy, reported through the onboarding
 * `installation_*` events so the existing progress modal completes.
 */
final class GitCheckoutService
{
    /** The checkout root of a container project, home-relative. */
    private const CHECKOUT_DIR = 'project';

    public function __construct(
        private readonly DeployState $deployState,
        private readonly ApplicationSynchronizer $synchronizer,
        private readonly GitService $git,
    ) {}

    /**
     * The checkout's `.env.example` in the shape `preview-env-example` answers.
     *
     * @return array{has_example: bool, variables: list<array{key: string, value: string}>}
     */
    public function envExample(Application $application): array
    {
        try {
            $contents = (new FilesApi($application->engine()))
                ->readFile($application->engineProject(), self::CHECKOUT_DIR.'/.env.example');
        } catch (EngineRequestException $e) {
            // No example in the repository is a normal answer, not an error.
            if ($e->engineStatus === 404) {
                return ['has_example' => false, 'variables' => []];
            }

            throw $e;
        }

        // Names only, like the HTTPS preview: the example's values are not defaults.
        $variables = [];
        foreach (EnvFileParser::parse($contents) as $row) {
            if (($row['type'] ?? null) === 'variable') {
                $variables[(string) $row['key']] = ['key' => (string) $row['key'], 'value' => ''];
            }
        }

        return ['has_example' => $variables !== [], 'variables' => array_values($variables)];
    }

    /**
     * Start the first deploy of the connected checkout and follow it as an
     * installation. Idempotent: a project that already has a git install is
     * returned as it is.
     *
     * @param  array<string, mixed>  $params  validated GitDeployRequest body
     *
     * @throws ValidationException not a container project, not connected, or a
     *                             deploy already starting
     */
    public function deploy(Application $application, array $params): Application
    {
        $lock = Cache::lock(
            OnboardingDeployService::deployLockKey($application->id),
            OnboardingDeployService::deployLockSeconds(),
        );
        if (! $lock->get()) {
            throw ValidationException::withMessages([
                'branch' => ['A deploy is already starting for this project. Try again in a moment.'],
            ]);
        }

        try {
            // `isContainer()` and the connected branch read the mirror, which
            // the connect call just changed on the Engine.
            $api = new ProjectsApi($application->engine());
            $application = $this->synchronizer->mirror($application->engine_id, $api->show($application->engineProject())) ?? $application;

            if (! $application->isContainer()) {
                throw ValidationException::withMessages([
                    'deploy' => ['Deploys are only available for container projects.'],
                ]);
            }
            if ($application->gitRepositoryUrl() === null) {
                throw ValidationException::withMessages([
                    'deploy' => ['Connect a Git repository to this project first.'],
                ]);
            }

            // A git deploy is already recorded (the settle rebuild below counts as
            // one): repeat the call as a no-op only when no other branch is asked
            // for, so a retry after a failed branch switch still switches.
            $branch = trim(Payload::string($params['branch'] ?? null));
            $switchBranch = $branch !== '' && $branch !== $application->gitBranch();
            $hasInstall = $this->deployState->hasGitInstall($application);
            if ($hasInstall && ! $switchBranch) {
                return $application;
            }

            $this->storeEnvVars($application, $params['env_vars'] ?? null);

            if ($switchBranch) {
                if (! $hasInstall) {
                    // The settle rebuild may wait up to the Engine's long timeout.
                    if ($lock instanceof CacheLock) {
                        $lock->refresh(EngineClient::LONG_TIMEOUT_SECONDS + OnboardingDeployService::deployLockSeconds());
                    }
                    $this->git->settleCheckout($application, now()->getTimestamp() + EngineClient::LONG_TIMEOUT_SECONDS);
                }
                $response = $api->gitChangeBranch($application->engineProject(), $branch);
            } else {
                $response = $api->rebuild($application->engineProject());
            }

            $this->deployState->follow(
                $application,
                Payload::int($response->json('data.id')),
                new DeployWatch('user.instance.installation_finished', 'user.instance.installation_failed'),
                DeployState::SOURCE_GIT,
            );
        } finally {
            $lock->release();
        }

        return $application;
    }

    /**
     * Keep the wizard's variables for the deploy that follows (`apply: none`).
     * The Engine replaces the whole map, so the project's existing variables
     * are merged in first.
     */
    private function storeEnvVars(Application $application, mixed $envVars): void
    {
        $new = [];
        $object = Payload::object($envVars);
        foreach (array_keys($object) as $key) {
            $new[(string) $key] = Payload::string($object[$key]);
        }
        if ($new === []) {
            return;
        }

        $api = new EnvVarsApi($application->engine());

        $merged = [];
        foreach (Payload::objects(Payload::object($api->show($application->engineProject()))['vars'] ?? null) as $var) {
            $key = Payload::nullableString($var['key'] ?? null);
            if ($key !== null && $key !== '') {
                $merged[$key] = Payload::string($var['value'] ?? null);
            }
        }

        $api->update($application->engineProject(), array_merge($merged, $new), false);
    }
}
