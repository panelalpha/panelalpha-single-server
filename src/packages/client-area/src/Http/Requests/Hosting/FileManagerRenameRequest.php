<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /file-manager/rename – the fm SPA body `{disk, oldName, newName, type}`.
 */
final class FileManagerRenameRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'disk' => ['nullable', 'string'],
            'oldName' => ['required', 'string'],
            'newName' => ['required', 'string'],
            'type' => ['nullable', 'string'],
        ];
    }
}
