<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /projects/{id}/logs – the CA activity-log query.
 */
final class ActivityLogListRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'sort_by' => ['nullable', 'string'],
            'sort_dir' => ['nullable', 'string', 'in:asc,desc'],
            'search_term' => ['nullable', 'string', 'max:255'],
        ];
    }
}
