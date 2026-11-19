<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /server-accounts/{id}/mysql/users – the old MysqlUserStoreRequest rules.
 */
final class MysqlUserRequest extends FormRequest
{
    /** The Add User dialog's limit on the part the user types (`user-modals.ts`). */
    public const NAME_MAX_LENGTH = 16;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'regex:/^[A-Za-z_-][A-Za-z0-9_-]*$/', 'min:1', 'max:'.self::NAME_MAX_LENGTH],
            'password' => ['required', 'string', 'min:8', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.max' => 'Username must be at most '.self::NAME_MAX_LENGTH.' characters long',
        ];
    }
}
