<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * DELETE /projects/{id}. Deleting a project removes its files and databases on
 * the Engine, which has no keep option, so the two old dialog options and the
 * dialog's final confirmation are required acknowledgements of what is lost.
 */
final class ProjectDestroyRequest extends FormRequest
{
    private const REFUSAL = 'Deleting a project also deletes its files and databases; ';

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'remove_data' => ['required', 'accepted'],
            'remove_database' => ['required', 'accepted'],
            'confirm' => ['required', 'accepted'],
            'defer_while_busy' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'remove_data.required' => self::REFUSAL.'the files acknowledgement must be accepted.',
            'remove_data.accepted' => self::REFUSAL.'the files acknowledgement must be accepted.',
            'remove_database.required' => self::REFUSAL.'the databases acknowledgement must be accepted.',
            'remove_database.accepted' => self::REFUSAL.'the databases acknowledgement must be accepted.',
            'confirm.required' => self::REFUSAL.'the removal confirmation must be accepted.',
            'confirm.accepted' => self::REFUSAL.'the removal confirmation must be accepted.',
        ];
    }
}
