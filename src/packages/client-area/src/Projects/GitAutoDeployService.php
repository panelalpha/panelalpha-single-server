<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Projects\GitAutoDeployHooks;
use PanelAlpha\ClientArea\Projects\GitService;
use PanelAlpha\ClientArea\Git\ProviderTarget;
use PanelAlpha\ClientArea\Git\Providers\ProviderFactory;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use Throwable;

/**
 * The auto-deploy/webhook implementation of the {@see GitAutoDeployHooks} seam,
 * extracted from {@see GitService} unchanged and moved to `client-area-legacy`;
 * it works around the Engine having no provider webhook. The hook-delivery
 * import into the panel deploy history is gone: the Engine's deploy history
 * lists hook deploys (`trigger: hook`).
 *
 * Permanent panel code: the Engine does not need a provider webhook (the panel
 * registers it itself, as the old panel did), so this moved from
 * client-area-legacy into the controller.
 */
final class GitAutoDeployService implements GitAutoDeployHooks
{
    public function __construct(private readonly ProviderFactory $providers) {}

    /**
     * `PUT /projects/{id}/auto-deploy {auto_deploy_enabled: true}`: create the
     * Engine deploy hook, register the push webhook at the provider with the
     * URL and one-time secret it returns, and keep the provider's id. A provider failure removes the Engine hook again so
     * the next toggle is clean.
     */
    public function enable(Application $application): void
    {
        $api = new ProjectsApi($application->engine());

        if ($application->git_webhook_id !== null) {
            try {
                $api->showDeployHook($application->engineProject());

                return; // already registered
            } catch (EngineRequestException $e) {
                if ($e->engineStatus !== 404) {
                    throw $e;
                }
                // The Engine hook disappeared but the provider may still hold
                // the old hook: remove it before registering the new one.
                $this->deleteProviderWebhook($application);
            }
        }

        $target = ProviderTarget::of($application);
        $token = (string) ($application->gitToken() ?? '');
        if ($target === null || $token === '') {
            throw ValidationException::withMessages([
                'auto_deploy_enabled' => ['The repository credentials are missing; update the git credentials first.'],
            ]);
        }

        $hook = $api->createDeployHook($application->engineProject());
        if (! is_string($hook['secret'] ?? null) || $hook['secret'] === '') {
            // The hook already existed; rotating is the only way to a secret.
            $hook = $api->rotateDeployHook($application->engineProject());
        }

        $url = $hook['url'] ?? null;
        $secret = $hook['secret'] ?? null;
        if (! is_string($url) || $url === '' || ! is_string($secret) || $secret === '') {
            throw new EngineRequestException(502, 'The Engine did not return a deploy-hook URL and secret.');
        }

        try {
            $isSelfSigned = $this->isSelfSignedHook($api, $application, $hook);
            $id = $this->providers->for($target, $token)->registerWebhook(
                $url,
                $secret,
                $application->gitBranch(),
                $isSelfSigned,
            );
        } catch (Throwable $e) {
            report($e);
            $this->tryDeleteEngineHook($api, $application);

            throw ValidationException::withMessages([GitService::WEBHOOK_REGISTRATION_FAILED]);
        }

        if ($id === '') {
            $this->tryDeleteEngineHook($api, $application);

            throw ValidationException::withMessages([GitService::WEBHOOK_REGISTRATION_FAILED]);
        }

        $application->forceFill(['git_webhook_id' => $id])->save();
    }

    /**
     * Engine hook first: with the Engine down nothing may be cleared, or the
     * provider would keep calling a hook the panel can no longer delete
     * (persist after accept).
     */
    public function disable(Application $application): void
    {
        $this->deleteEngineHook(new ProjectsApi($application->engine()), $application);

        // The provider webhook is ours to remove; a failure there is reported and
        // the local marker still cleared, because the Engine hook is gone.
        $this->deleteProviderWebhook($application);

        $application->forceFill(['git_webhook_id' => null])->save();
    }

    /**
     * `POST E:/git/deploy-hook/rotate`: the Engine replaces the hook's URL and
     * secret, so the provider webhook is re-created at the new pair.
     */
    public function rotate(Application $application): void
    {
        $target = ProviderTarget::of($application);
        $token = (string) ($application->gitToken() ?? '');
        $webhookId = $application->git_webhook_id;
        if ($target === null || $token === '' || $webhookId === null) {
            return;
        }

        $api = new ProjectsApi($application->engine());
        $hook = $api->rotateDeployHook($application->engineProject());
        $url = $hook['url'] ?? null;
        $secret = $hook['secret'] ?? null;
        if (! is_string($url) || $url === '' || ! is_string($secret) || $secret === '') {
            throw new EngineRequestException(502, 'The Engine did not return a deploy-hook URL and secret.');
        }

        $provider = $this->providers->for($target, $token);
        try {
            $provider->deleteWebhook($webhookId);
        } catch (Throwable $e) {
            report($e);
        }

        $id = $provider->registerWebhook(
            $url,
            $secret,
            $application->gitBranch(),
            $this->isSelfSignedHook($api, $application, $hook),
        );

        if ($id === '') {
            throw new EngineRequestException(502, 'The git provider did not return a webhook id.');
        }

        $application->forceFill(['git_webhook_id' => $id])->save();
    }

    /**
     * Whether the Engine's Deploy Hook uses a self-signed certificate, so the
     * git provider must skip TLS verification. `create`/`show` carry the
     * advisory; `rotate` does not (Engine `DeployHookActions::rotate` returns
     * `describe() + rotated + secret`), so read it from `show` in that case.
     *
     * @param  array<string, mixed>  $hook
     */
    private function isSelfSignedHook(ProjectsApi $api, Application $application, array $hook): bool
    {
        if (! is_array($hook['tls'] ?? null)) {
            $hook = $api->showDeployHook($application->engineProject());
        }

        return (Payload::object($hook['tls'] ?? null)['state'] ?? null) === 'self_signed';
    }

    /**
     * A provider 404 (or a missing token) means there is nothing to delete; a
     * failure must not stop the local cleanup, so it is reported, not thrown.
     */
    public function deleteProviderWebhook(Application $application): void
    {
        $id = $application->git_webhook_id;
        $target = ProviderTarget::of($application);
        $token = (string) ($application->gitToken() ?? '');

        if ($id === null || $target === null || $token === '') {
            return;
        }

        try {
            $this->providers->for($target, $token)->deleteWebhook($id);
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * Delete the Engine hook. A 404 means there is nothing left to delete, and a
     * 422 is treated as gone too – **defensive**, because a DELETE without
     * `path` cannot answer 422. Any other answer –
     * including an unreachable Engine – bubbles so the caller keeps the provider
     * webhook and the stored marker.
     */
    private function deleteEngineHook(ProjectsApi $api, Application $application): void
    {
        try {
            $api->deleteDeployHook($application->engineProject());
        } catch (EngineValidationException) {
            // Defensive (not an Engine shape): a DELETE without `path` cannot
            // answer 422 – the Engine's show/delete skip the connection check
            // (`DeployHooks.php:83-98`); the "not connected" 422 comes only from
            // create. Kept so a 422 is never mistaken for a reason to keep the
            // provider webhook.
        } catch (Throwable $e) {
            if (! $e instanceof EngineRequestException || $e->engineStatus !== 404) {
                throw $e;
            }
        }
    }

    /**
     * Best-effort Engine-hook rollback after a failed registration: the
     * registration failure is what the CA must see, so a failing delete is
     * reported, not thrown.
     */
    private function tryDeleteEngineHook(ProjectsApi $api, Application $application): void
    {
        try {
            $this->deleteEngineHook($api, $application);
        } catch (Throwable $e) {
            report($e);
        }
    }
}
