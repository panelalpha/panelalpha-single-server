<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/{application}/git/pull – the old InstanceGitPullRequest.
 */
final class GitPullRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'strategy' => ['nullable', 'string', 'in:ff,force,push_first'],
        ];
    }
}
