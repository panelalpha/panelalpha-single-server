<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PUT /server-accounts/{id}/domains/{domain} – the old ServerAccount\
 * DomainUpdateRequest, aligned with the Engine's DomainUpdateRequest.
 */
final class DomainUpdateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'document_root' => [
                'sometimes',
                'string',
                'max:4096',
                'regex:/^\/(?:[A-Za-z0-9._~@+,=-]+\/?)*$/D',
                'not_regex:/(?:^|\/)\.\.(?:\/|$)/',
            ],
            'redirect_enabled' => ['sometimes', 'boolean'],
            'redirect_url' => [
                Rule::requiredIf(fn (): bool => $this->boolean('redirect_enabled')),
                'nullable',
                'url',
                'max:2048',
                'not_regex:/[\s"\'\\\\$;{}`]/',
            ],
            'force_https_redirect' => ['sometimes', 'boolean'],
            'aliases' => ['sometimes', 'nullable', 'array'],
            'aliases.*' => ['nullable', 'string'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'redirect_url.required' => 'Enter the URL to redirect the domain to.',
        ];
    }
}
