<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project\WordPress;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Maintenance / debug / search-indexing toggles – the CA sends `{status}`.
 */
final class ToggleStatusRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'status' => ['required', 'boolean'],
        ];
    }
}
