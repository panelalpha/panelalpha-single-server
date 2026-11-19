<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /projects/{application}/git/credentials – the old
 * InstanceGitUpdateCredentialsRequest.
 */
final class GitCredentialsRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'token' => ['nullable', 'string'],
            'auth_type' => ['nullable', 'string'],
        ];
    }
}
