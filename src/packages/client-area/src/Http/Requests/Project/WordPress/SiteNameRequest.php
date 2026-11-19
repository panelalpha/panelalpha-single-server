<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project\WordPress;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Site name – the CA sends `name` (old InstanceController::updateSiteName). (section H)
 */
final class SiteNameRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
        ];
    }
}
