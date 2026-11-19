<?php

namespace App\Actions\Fortify;

use App\Actions\Fortify\Concerns\RefreshesAuthenticationSessions;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Laravel\Fortify\Contracts\UpdatesUserPasswords;

/**
 * Changes the password of the authenticated user. Validates the current
 * password and puts the error on `current_password`, which the CA shows; a
 * user whose password was generated at setup skips that check.
 * A credential change regenerates the session and ends the other devices.
 */
class UpdateUserPassword implements UpdatesUserPasswords
{
    use PasswordValidationRules;
    use RefreshesAuthenticationSessions;

    /**
     * @param  array{current_password?: string, password: string}  $input
     */
    public function update(User $user, array $input): void
    {
        $rules = ['password' => $this->passwordRules()];
        if (! $user->password_generated) {
            $rules['current_password'] = ['required', 'string'];
        }

        Validator::make($input, $rules)->after(function (\Illuminate\Validation\Validator $validator) use ($user, $input) {
            if ($user->password_generated) {
                return;
            }
            if (! isset($input['current_password']) || ! Hash::check($input['current_password'], $user->password)) {
                $validator->errors()->add('current_password', 'The provided password does not match your current password.');
            }
        })->validate();

        $user->forceFill([
            'password' => Hash::make($input['password']),
            'password_change_required' => false,
            'password_generated' => false,
        ])->save();

        $this->refreshAuthenticationSessions($user);
    }
}
