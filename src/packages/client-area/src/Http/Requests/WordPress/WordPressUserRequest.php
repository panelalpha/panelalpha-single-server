<?php

namespace PanelAlpha\ClientArea\Http\Requests\WordPress;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * POST /projects/{application}/wordpress/users – the old
 * `Requests/User/Instance/Wordpress/UserStoreRequest` rules.
 */
final class WordPressUserRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'username' => ['required', 'string'],
            'email' => ['required', 'email'],
            'display_name' => ['required', 'string'],
            'password' => ['required', 'string', Password::defaults()],
            'role' => ['required', 'in:administrator,editor,author,contributor,subscriber'],
            'send_email' => ['boolean', 'nullable'],
        ];
    }
}
