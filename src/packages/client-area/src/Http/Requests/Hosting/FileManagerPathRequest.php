<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The `disk`/`path` query the fm SPA sends on the file-manager reads
 * (`fm/src/store/actions.js`). `path` must be a string (or absent): a `path[]`
 * array would otherwise be narrowed to the home root by `Payload::string()`
 * and list the wrong directory, so it is validated here and answers 422.
 */
final class FileManagerPathRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'disk' => ['nullable', 'string'],
            'path' => ['nullable', 'string'],
        ];
    }
}
