<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Closure;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/upload-files (and the /instances alias) – the CA posts the raw
 * file body with `service_id`, `domain_id` (= the project id) and `filename` as
 * query parameters (`OnboardingModalWrapper.vue:905-913`).
 *
 * The old route validated only these three fields; the body is read as a raw
 * stream, not multipart. The archive name is whitelisted here (letters, digits,
 * dots, underscores, hyphens) and must have a non-empty stem, so a NUL or a bare
 * `.zip` can never become the `<app-dir>/.panelalpha-upload/…` path the Engine
 * writes.
 */
final class UploadFilesRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'service_id' => ['required', 'integer'],
            'domain_id' => ['required', 'integer'],
            'filename' => [
                'required',
                'string',
                'max:255',
                'regex:/^[A-Za-z0-9._-]+$/',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (! is_string($value) || pathinfo($value, PATHINFO_FILENAME) === '') {
                        $fail('The filename field must have a non-empty name.');
                    }
                },
            ],
        ];
    }
}
