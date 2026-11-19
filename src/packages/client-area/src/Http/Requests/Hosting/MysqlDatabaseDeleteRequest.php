<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * DELETE /server-accounts/{id}/mysql/databases/{name} – the delete dialog's
 * confirmation box is required: dropping a database removes its data.
 */
final class MysqlDatabaseDeleteRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'confirm' => ['required', 'accepted'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'confirm.required' => 'Deleting a database removes its data; the confirmation must be accepted.',
            'confirm.accepted' => 'Deleting a database removes its data; the confirmation must be accepted.',
        ];
    }
}
