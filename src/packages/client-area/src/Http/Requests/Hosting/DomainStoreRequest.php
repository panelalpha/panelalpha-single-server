<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /server-accounts/{id}/domains – the old ServerAccount\DomainStoreRequest.
 * The Engine supports addon and sub domains (aliases are managed on an existing
 * domain, not created standalone in single-server).
 */
final class DomainStoreRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $domainRegex = '/^(?!:\/\/)(?=.{1,255}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i';

        return [
            'domain' => ['required', 'string', 'max:255', 'regex:'.$domainRegex],
            'parent_domain' => ['nullable', 'string', 'max:255', 'regex:'.$domainRegex],
            'type' => ['required', 'string', Rule::in(['addon', 'sub'])],
            'no_ssl' => ['sometimes', 'boolean'],
            'aliases' => ['sometimes', 'array'],
            'aliases.*' => ['nullable', 'string'],
        ];
    }
}
