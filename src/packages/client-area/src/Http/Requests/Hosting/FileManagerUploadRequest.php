<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * POST /file-manager/upload – the fm SPA FormData `{disk, path, overwrite,
 * files[], names[]}`.
 */
final class FileManagerUploadRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'disk' => ['nullable', 'string'],
            'path' => ['nullable', 'string'],
            'overwrite' => ['nullable'],
            'files' => ['required', 'array'],
            'files.*' => ['file', 'max:'.$this->maxKb()],
            'names' => ['nullable', 'array'],
            'names.*' => ['nullable', 'string'],
        ];
    }

    private function maxKb(): int
    {
        return max(1, intdiv(Payload::int(config('client-area.upload_max_bytes', 268435456)) ?? 268435456, 1024));
    }
}
