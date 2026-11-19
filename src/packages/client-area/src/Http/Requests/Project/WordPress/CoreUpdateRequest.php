<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project\WordPress;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Core update – `version` is required; `create_backup` is accepted. (section H)
 *
 * An untouched dialog checkbox reaches the server as `null`; it means the box
 * was not ticked, so it is read as `false` rather than refused.
 */
final class CoreUpdateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'version' => ['required', 'string', 'max:32'],
            'create_backup' => ['sometimes', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('create_backup') && $this->input('create_backup') === null) {
            $this->merge(['create_backup' => false]);
        }
    }
}
