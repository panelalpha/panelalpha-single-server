<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /file-manager/paste – the fm SPA body `{disk, path, clipboard}`.
 */
final class FileManagerClipboardRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'disk' => ['nullable', 'string'],
            'path' => ['nullable', 'string'],
            'clipboard' => ['required', 'array'],
            'clipboard.type' => ['required', 'string', 'in:copy,cut'],
            'clipboard.directories' => ['nullable', 'array'],
            'clipboard.directories.*' => ['string'],
            'clipboard.files' => ['nullable', 'array'],
            'clipboard.files.*' => ['string'],
        ];
    }
}
