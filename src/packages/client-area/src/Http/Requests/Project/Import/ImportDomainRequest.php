<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project\Import;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/import/domain – the old `ImportDomainRequest` rules
 * (packages/api/app/Http/Requests/User/Instance/ImportDomainRequest.php:9-30)
 * for the body the CA sends (`OnboardingModalWrapper.vue:1757-1762`).
 */
final class ImportDomainRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'service_id' => ['required', 'integer'],
            'url' => ['required', 'string', 'url'],
            'delegated_user_email' => ['nullable', 'string', 'email'],
            'user_configurable_options' => ['nullable', 'array'],
        ];
    }
}
