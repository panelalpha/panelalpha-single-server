<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/git-branches – the old InstanceController::gitBranches rules.
 */
final class GitBranchesRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'repo_url' => ['required', 'string', 'max:2048'],
            'token' => ['nullable', 'string'],
        ];
    }
}
