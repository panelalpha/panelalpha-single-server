<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project\Import;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /projects/import/test-wordpress-url – the old `testWordpressUrl` rules
 * (packages/api/app/Http/Controllers/User/Instance/ImportController.php:64-67)
 * for the query the CA builds (`OnboardingImportUrlModal.vue:232-237`).
 */
final class ImportTestUrlRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'url' => ['required', 'url'],
            'ip_address' => ['nullable', 'ip'],
        ];
    }
}
