<?php

namespace PanelAlpha\ClientArea\Http\Requests\Mcp;

use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /mcp-activity-logs – the old `McpActivityLogController@index` rules
 * (packages/api/app/Http/Controllers/User/McpActivityLogController.php:26-49).
 */
final class McpActivityLogRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'token_name' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
