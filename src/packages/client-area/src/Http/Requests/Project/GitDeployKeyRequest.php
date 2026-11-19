<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/{application}/git/deploy-key – the optional SSH repository
 * URL whose self-hosted forge the Engine pins for the project's deploy key.
 */
final class GitDeployKeyRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'repo_url' => ['nullable', 'string', 'max:2048'],
        ];
    }
}
