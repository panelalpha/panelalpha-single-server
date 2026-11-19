<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /projects/{application}/auto-deploy – the old InstanceGitAutoDeployRequest.
 *
 * Permanent panel code: the panel registers the provider webhook itself, as
 * the old panel did, so this moved from client-area-legacy into the controller. Ported
 * from the old panel's
 * `app/Http/Requests/User/Instance/InstanceGitAutoDeployRequest.php`.
 */
final class GitAutoDeployRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'auto_deploy_enabled' => ['required', 'boolean'],
        ];
    }
}
