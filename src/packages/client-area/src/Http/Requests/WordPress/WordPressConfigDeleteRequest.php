<?php

namespace PanelAlpha\ClientArea\Http\Requests\WordPress;

use Illuminate\Foundation\Http\FormRequest;

/**
 * DELETE /projects/{application}/wordpress/config/{name} – the old
 * `ConfigController::destroy` rules: `type` required and one of
 * constant/variable, sent in the DELETE body (`ConfigActionsMixin.js:41-45`).
 */
final class WordPressConfigDeleteRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', 'string', 'in:constant,variable'],
        ];
    }
}
