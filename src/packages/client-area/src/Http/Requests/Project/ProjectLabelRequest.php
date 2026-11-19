<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST/DELETE /projects/{id}/labels – labels are identified by title. (section B)
 */
final class ProjectLabelRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
        ];
    }
}
