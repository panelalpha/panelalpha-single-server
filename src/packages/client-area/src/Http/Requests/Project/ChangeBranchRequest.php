<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /projects/{application}/change-branch – the old InstanceGitChangeBranchRequest.
 */
final class ChangeBranchRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'branch' => ['required', 'string', 'max:255'],
        ];
    }
}
