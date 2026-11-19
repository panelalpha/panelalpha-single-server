<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/{application}/deploy/upload – the old RedeployUploadRequest.
 * The CA posts the raw request body with `?filename=&deploy_staging=`, so the
 * filename arrives as a query parameter.
 */
final class RedeployUploadRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'filename' => ['required', 'string', 'max:255'],
            'deploy_staging' => ['sometimes', 'boolean'],
        ];
    }
}
