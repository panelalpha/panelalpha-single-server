<?php

namespace App\Services\Account;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * My-account profile rules. The controller validates the
 * request; the rules that need the current user (password confirmation before
 * an e-mail change, which fields are writable) live here.
 */
final class AccountService
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public function update(User $user, array $attributes): void
    {
        $user->update($attributes);
    }

    /**
     * Change the e-mail after confirming the current password.
     *
     * @throws ValidationException when the password does not match
     */
    public function updateEmail(User $user, string $email, string $password): void
    {
        if (! Hash::check($password, $user->password)) {
            throw ValidationException::withMessages(['password' => ['Invalid Password']]);
        }

        // Login is case-insensitive, so store the address lower-cased.
        $user->forceFill(['email' => strtolower(trim($email))])->save();
    }
}
