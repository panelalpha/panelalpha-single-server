<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/preview-env-example – the old InstanceController::previewEnvExample
 * rules. Used on the onboarding git/files flow before a project exists, so it
 * takes a repository URL (inspected through POST E/source/inspect) or an
 * uploaded archive path.
 */
final class PreviewEnvExampleRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'repo_url' => ['nullable', 'string', 'max:2048'],
            'token' => ['nullable', 'string'],
            'branch' => ['nullable', 'string', 'max:255'],
            'remote_filepath' => ['nullable', 'string'],
            'service_id' => ['nullable', 'integer'],
            'domain_id' => ['nullable', 'integer'],
        ];
    }
}
