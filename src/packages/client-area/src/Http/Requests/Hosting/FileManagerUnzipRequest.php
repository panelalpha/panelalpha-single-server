<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /file-manager/unzip – the fm SPA body `{disk, path, folder}`.
 */
final class FileManagerUnzipRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'disk' => ['nullable', 'string'],
            'path' => ['required', 'string'],
            'folder' => ['nullable', 'string'],
        ];
    }
}
