<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/{application}/git/connect and /git/repair – the old
 * InstanceGitConnectRequest.
 */
final class GitConnectRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Exactly one of the two identifies the repository (old request).
            'repo_url' => ['nullable', 'string', 'max:2048', 'required_without:git_repository_id'],
            // The CA may reuse a stored repository instead of a URL.
            'git_repository_id' => ['nullable', 'integer', 'min:1', 'required_without:repo_url'],
            'branch' => ['nullable', 'string', 'max:255'],
            'auth_type' => ['nullable', 'string'],
            'token' => ['nullable', 'string'],
            'repair' => ['sometimes', 'boolean'],
        ];
    }
}
