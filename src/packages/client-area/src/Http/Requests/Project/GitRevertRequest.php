<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /projects/{application}/git/revert – the old InstanceGitRevertRequest.
 */
final class GitRevertRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'ref' => ['nullable', 'string', 'max:255'],
        ];
    }
}
