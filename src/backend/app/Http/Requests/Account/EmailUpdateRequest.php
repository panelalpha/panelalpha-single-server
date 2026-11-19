<?php

namespace App\Http\Requests\Account;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PUT /api/user/edit/email – the old rules, plus a case-insensitive uniqueness
 * check because login is case-insensitive. The address the account
 * already has is not a duplicate of itself.
 */
final class EmailUpdateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var User|null $user */
        $user = $this->user();
        $currentKey = $user?->getKey();

        return [
            'password' => ['required', 'string'],
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                function (string $attribute, mixed $value, \Closure $fail) use ($currentKey): void {
                    if (! is_string($value)) {
                        return;
                    }

                    $exists = User::query()
                        ->whereRaw('LOWER(email) = ?', [strtolower($value)])
                        ->when($currentKey !== null, fn ($query) => $query->whereKeyNot($currentKey))
                        ->exists();

                    if ($exists) {
                        $fail('The email has already been taken.');
                    }
                },
                Rule::unique('users', 'email')->ignore($currentKey), // exact duplicate, cheap index hit
            ],
        ];
    }
}
