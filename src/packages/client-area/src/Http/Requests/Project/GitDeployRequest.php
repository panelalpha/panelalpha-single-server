<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/{application}/git/deploy – the first deploy of a connected
 * SSH checkout (git-deploy-keys): the branch to deploy and the env vars of the
 * wizard's env step.
 */
final class GitDeployRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'branch' => ['required', 'string', 'max:255'],
            'env_vars' => ['nullable', 'array', 'max:200'],
            'env_vars.*' => ['nullable', 'string', 'max:8192'],
        ];
    }
}
