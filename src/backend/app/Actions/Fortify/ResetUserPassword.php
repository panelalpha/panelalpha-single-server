<?php

namespace App\Actions\Fortify;

use App\Actions\Fortify\Concerns\RefreshesAuthenticationSessions;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Laravel\Fortify\Contracts\ResetsUserPasswords;

/**
 * Sets a new password after a valid reset link. Clears the single-server
 * `password_change_required` flag, matching the old panel, and `password_generated`:
 * the user now knows their password. A reset regenerates
 * the session and ends the user's other sessions.
 */
class ResetUserPassword implements ResetsUserPasswords
{
    use PasswordValidationRules;
    use RefreshesAuthenticationSessions;

    /**
     * @param  array{password: string}  $input
     */
    public function reset(User $user, array $input): void
    {
        Validator::make($input, [
            'password' => $this->passwordRules(),
        ])->validate();

        $user->forceFill([
            'password' => Hash::make($input['password']),
            'password_change_required' => false,
            'password_generated' => false,
        ])->save();

        $this->refreshAuthenticationSessions($user);
    }
}
