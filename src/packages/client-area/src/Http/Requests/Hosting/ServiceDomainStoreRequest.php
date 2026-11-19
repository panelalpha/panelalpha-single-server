<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /services/{id}/domains – the onboarding domain step, including the files-source body. (section O)
 */
final class ServiceDomainStoreRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'domain' => ['sometimes', 'nullable', 'string', 'max:255'],
            'name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'username' => ['sometimes', 'nullable', 'string', 'max:64'],
            'source_type' => ['sometimes', 'nullable', 'string'],
            'repo_url' => ['sometimes', 'nullable', 'string'],
            'token' => ['sometimes', 'nullable', 'string'],
            'branch' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
