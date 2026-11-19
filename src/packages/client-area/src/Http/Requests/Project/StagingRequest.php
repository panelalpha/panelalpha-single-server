<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/{application}/staging – the old InstanceController::createStaging
 * rules. The domain is optional: the Engine allocates and
 * registers one for a copy of a site on panelalpha.online.
 */
final class StagingRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'protocol' => ['nullable', 'string', 'in:https://,http://'],
            'domain' => ['nullable', 'string', 'max:255', 'regex:/^(?!:\/\/)(?=.{1,255}$)((.{1,63}\.){1,127}(?![0-9]*$)[a-z0-9-]+\.?)$/i'],
            'dir' => ['nullable', 'string', 'regex:/^[A-Za-z0-9_-]+$/'],
            'skip_uploads_dir' => ['nullable', 'boolean'],
        ];
    }
}
