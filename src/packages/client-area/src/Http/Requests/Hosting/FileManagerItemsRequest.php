<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /file-manager/delete – the fm SPA body `{disk, items:[{path,…}]}`.
 */
final class FileManagerItemsRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'disk' => ['nullable', 'string'],
            'items' => ['required', 'array'],
            'items.*.path' => ['required', 'string'],
        ];
    }
}
