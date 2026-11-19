<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /file-manager/create-directory, /create-file – the fm SPA body
 * `{disk, path, name}` (`fm/src/http/post.js`).
 */
final class FileManagerRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'disk' => ['nullable', 'string'],
            'path' => ['nullable', 'string'],
            'name' => ['required', 'string'],
        ];
    }
}
