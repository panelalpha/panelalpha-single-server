<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Projects\DeployService;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use Throwable;

/**
 * POST /projects/deploy (and the /instances alias) – the old
 * `Requests/User/InstanceDeployRequest` rules. Both sources are
 * implemented: files and git (engine `POST /projects/{u}/source`).
 */
final class ProjectDeployRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'service_id' => ['required', 'integer'],
            'domain_id' => ['nullable', 'integer'],
            'shared_access' => ['nullable', 'array'],
            'shared_access.*' => ['string'],
            'source_type' => ['required', 'string', 'in:git,files'],
            'repo_url' => ['nullable', 'string'],
            'token' => ['nullable', 'string'],
            'branch' => ['nullable', 'string', 'max:255'],
            'env_vars' => ['nullable', 'array', 'max:200'],
            'env_vars.*' => ['nullable', 'string', 'max:8192'],
            'remote_filepath' => ['nullable', 'array'],
            'remote_filepath.*' => ['string'],
        ];
    }

    /**
     * v1's own validation refused the deploy after the CA uploaded the archive
     * (more than 200 env vars, an env value over 8192 characters, and similar),
     * so the Engine's staging folder must not keep it. Runs before
     * `parent::failedValidation()` throws; a cleanup failure never hides the 422.
     */
    protected function failedValidation(Validator $validator): void
    {
        $this->discardRefusedArchive();

        parent::failedValidation($validator);
    }

    private function discardRefusedArchive(): void
    {
        // The fields the cleanup needs may themselves be the invalid ones
        // (a missing service or a string remote_filepath): only a path we can
        // confirm inside the project is touched.
        $paths = $this->input('remote_filepath');
        if (! is_array($paths) || $paths === []) {
            return;
        }

        $user = $this->user();
        $domainId = Payload::int($this->input('domain_id'));
        $service = Payload::int($this->input('service_id'));
        if ($user === null || $domainId === null || $service === null
            || app(ServiceDirectory::class)->findForUser($user, $service) === null) {
            return;
        }

        try {
            $application = app(ApplicationRepository::class)->findForUser($user, $domainId);
            app(DeployService::class)->discardRefusedArchive($application, $paths);
        } catch (Throwable $e) {
            // The validation error is the answer; a cleanup failure (or an
            // application the user cannot see) must not change it.
            report($e);
        }
    }
}
