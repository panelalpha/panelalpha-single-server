<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/deploy-key (and the /instances alias) – the wizard's
 * "Generate key" step for a private Git repository over SSH (git-deploy-keys).
 * `shared_access` shares the project as in `/projects/deploy`.
 */
final class ProjectDeployKeyRequest extends FormRequest
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
            'repo_url' => ['required', 'string', 'max:2048'],
        ];
    }
}
