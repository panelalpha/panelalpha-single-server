<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /projects/{id}/change-domain/subdomain – the CA sends `{subdomain, domain}` (SetYourDomainModal.vue:767). (section K)
 */
final class ChangeSubdomainRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'subdomain' => ['required', 'string', 'max:255'],
            'domain' => ['required', 'string', 'max:255'],
        ];
    }
}
