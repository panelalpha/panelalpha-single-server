<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * POST /file-manager/update-file – the fm SPA FormData `{path (dirname), file, name}`.
 */
final class FileManagerUpdateFileRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'disk' => ['nullable', 'string'],
            'path' => ['nullable', 'string'],
            'name' => ['required', 'string'],
            'file' => ['required', 'file', 'max:'.$this->maxKb()],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['name.required' => 'The name of the file is required.'];
    }

    private function maxKb(): int
    {
        return max(1, intdiv(Payload::int(config('client-area.upload_max_bytes', 268435456)) ?? 268435456, 1024));
    }
}
