<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /projects – the CA list query (Instances.js:57).
 */
final class ProjectListRequest extends FormRequest
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
            // The CA sends `labels=Prod,Staging` and the selected server account id.
            'labels' => ['nullable', 'string'],
            'server_account_id' => ['nullable', 'integer'],
        ];
    }
}
