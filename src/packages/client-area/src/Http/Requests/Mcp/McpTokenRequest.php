<?php

namespace PanelAlpha\ClientArea\Http\Requests\Mcp;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /mcp-tokens – the old `McpTokenController@store` rule
 * (packages/api/app/Http/Controllers/User/McpTokenController.php:43-60).
 */
final class McpTokenRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
        ];
    }
}
