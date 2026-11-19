<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project\WordPress;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Auto-update toggles – the CA sends all three fields on every change
 * (AutoUpdates.vue:156-158, 177-179, 197-199); the old
 * `ToggleAutoUpdateRequest` required each of them.
 */
final class AutoUpdateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'auto_update' => ['required', 'integer', 'in:0,1,2'],
            'auto_update_plugins' => ['required', 'integer', 'in:0,1'],
            'auto_update_themes' => ['required', 'integer', 'in:0,1'],
        ];
    }
}
