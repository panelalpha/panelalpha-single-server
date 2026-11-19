<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /server-accounts/{id}/mysql/databases/{name}/name – the old
 * `DatabaseRenameRequest` `name` rule. The body name is unprefixed; the Engine
 * re-adds the project DB prefix itself (`MysqlApi::renameDatabase`).
 */
final class MysqlDatabaseRenameRequest extends FormRequest
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
