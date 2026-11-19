<?php

namespace App\Http\Requests\Account;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/user/dark-mode – persist the user's dark-mode preference.
 */
final class DarkModeRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'dark_mode' => ['required', 'boolean'],
        ];
    }
}
