<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /server-accounts/{id}/mysql/users/{name} – the old mysql user update
 * (rename and/or password change).
 */
final class MysqlUpdateUserRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'regex:/^[A-Za-z_-][A-Za-z0-9_-]*$/', 'min:1', 'max:'.MysqlUserRequest::NAME_MAX_LENGTH],
            'password' => ['sometimes', 'nullable', 'string', 'min:8', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.max' => 'Username must be at most '.MysqlUserRequest::NAME_MAX_LENGTH.' characters long',
        ];
    }
}
