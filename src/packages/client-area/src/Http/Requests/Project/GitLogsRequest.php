<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /projects/{application}/git/logs – the CA's list query
 * (`page`, `per_page`, `sort_by=date`, `sort_dir`; Git.vue:1036-1039). Moved
 * from client-area-legacy with the git operation log.
 */
final class GitLogsRequest extends FormRequest
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
            'sort_dir' => ['nullable', 'in:asc,desc'],
        ];
    }
}
