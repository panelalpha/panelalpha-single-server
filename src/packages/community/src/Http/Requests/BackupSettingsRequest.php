<?php

namespace PanelAlpha\Community\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The defaults for new projects' automatic backups. Hour and days are UTC.
 */
class BackupSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'auto_enable' => ['required', 'boolean'],
            'frequency' => ['required', 'string', Rule::in(['daily', 'weekly', 'monthly'])],
            'hour' => ['required', 'integer', 'between:0,23'],
            'day_of_week' => ['required', 'integer', 'between:0,6'],
            'day_of_month' => ['required', 'integer', 'between:1,28'],
            'keep_last' => ['required', 'integer', 'between:1,365'],
        ];
    }
}
