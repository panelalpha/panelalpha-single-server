<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project\Import;

/**
 * POST /projects/import/import – the connection rules plus the project the
 * import's domain step created (`domain_id`, `OnboardingModalWrapper.vue:1779-1785`).
 */
final class ImportStartRequest extends ImportConnectionRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['domain_id' => ['required', 'integer']] + parent::rules();
    }
}
