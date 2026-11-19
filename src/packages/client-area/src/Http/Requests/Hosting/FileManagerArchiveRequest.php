<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /file-manager/zip/{id} and /unzip/{id}.
 */
final class FileManagerArchiveRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'path' => ['required', 'string', 'max:4096'],
            'zip_path' => ['sometimes', 'nullable', 'string', 'max:4096'],
        ];
    }
}
