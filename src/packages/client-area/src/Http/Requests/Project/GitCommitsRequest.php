<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /projects/{application}/git/commits – the old branch/limit query.
 */
final class GitCommitsRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'branch' => ['nullable', 'string', 'max:255'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
        ];
    }
}
