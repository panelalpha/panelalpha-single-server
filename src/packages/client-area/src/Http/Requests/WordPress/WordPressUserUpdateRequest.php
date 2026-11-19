<?php

namespace PanelAlpha\ClientArea\Http\Requests\WordPress;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /projects/{application}/wordpress/users/{user} – the old
 * `Requests/User/Instance/Wordpress/UserUpdateRequest` rules.
 */
final class WordPressUserUpdateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'email'],
            'display_name' => ['required', 'string'],
            'role' => ['required', 'in:administrator,editor,author,contributor,subscriber'],
            // The old UserUpdateRequest had only `nullable|string|max:255` – no
            // strength rule; Password::defaults() applies to **create** only
            //An empty value keeps the current password: the CA
            // sends `''` (tooltip `field.passwordLeaveEmpty`), which Laravel
            // turns into null, and the service then omits the field.
            'password' => ['nullable', 'string', 'max:255'],
        ];
    }
}
