<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/test-git-url – the old InstanceController::testGitUrl rules.
 */
final class TestGitUrlRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'repo_url' => ['required', 'string', 'max:2048'],
            'auth_type' => ['nullable', 'string'],
            'token' => ['nullable', 'string'],
        ];
    }
}
