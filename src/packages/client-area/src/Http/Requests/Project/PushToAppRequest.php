<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /projects/{application}/push-to-live, /push-to-staging – the old
 * PushToAppRequest. The CA's flags
 * map one to one to the Engine's `files`, `databases` and `tables`; the table
 * selections are the `database.name` strings the push dialog reads back from
 * `GET push/diff` and round-trips through its multi-select
 * (`InstanceActionsMixin.js:459-470`), so they are validated in the old
 * `array|nullable` of strings shape.
 */
final class PushToAppRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'overwrite_files' => ['required', 'boolean'],
            'push_db' => ['required', 'boolean'],
            'structural_change_tables' => ['nullable', 'array'],
            'structural_change_tables.*' => ['string'],
            'datachange_tables' => ['nullable', 'array'],
            'datachange_tables.*' => ['string'],
        ];
    }
}
