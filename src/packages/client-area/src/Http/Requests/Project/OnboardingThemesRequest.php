<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /projects/onboarding/themes – the old OnboardingController::themes query
 * (OnboardingChooseTemplateModal.vue builds it). Moved from client-area-legacy
 * with the catalog.
 */
final class OnboardingThemesRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'search_term' => ['nullable', 'string', 'max:255'],
            'tags' => ['nullable', 'string'],
            'browse' => ['nullable', 'string'],
            'service_id' => ['nullable', 'integer'],
        ];
    }
}
