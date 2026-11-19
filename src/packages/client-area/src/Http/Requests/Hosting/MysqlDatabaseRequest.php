<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /server-accounts/{id}/mysql/databases – the old DatabaseStoreRequest
 * rules (the Engine appends the project's DB prefix itself).
 */
final class MysqlDatabaseRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'regex:/^[A-Za-z_-][A-Za-z0-9_-]*$/', 'min:1', 'max:64'],
        ];
    }
}
