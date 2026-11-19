<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /file-manager/zip – the fm SPA body `{disk, path, name, elements}`.
 */
final class FileManagerZipRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'disk' => ['nullable', 'string'],
            'path' => ['nullable', 'string'],
            'name' => ['required', 'string'],
            'elements' => ['required', 'array'],
            'elements.directories' => ['nullable', 'array'],
            'elements.directories.*' => ['string'],
            'elements.files' => ['nullable', 'array'],
            'elements.files.*' => ['string'],
        ];
    }
}
