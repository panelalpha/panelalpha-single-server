<?php

namespace App\Actions\Fortify;

use Illuminate\Validation\Rules\Password;

/**
 * The one place panel-user password fields get their rules from.
 *
 * `Password::defaults()` carries the actual policy (set in
 * AppServiceProvider::boot()). Every password field of a panel user – reset,
 * change, later registration/invitation – uses this trait; never inline
 * `min:8`. MySQL/FTP/SFTP/WordPress/app-user passwords keep their own rules.
 */
trait PasswordValidationRules
{
    /**
     * Form-field rules: the policy plus a `password_confirmation` check.
     *
     * @return array<int, mixed>
     */
    protected function passwordRules(): array
    {
        return [...$this->passwordPolicy(), 'confirmed'];
    }

    /**
     * The bare policy, for places that confirm the password themselves
     * (interactive CLI commands) or not at all.
     *
     * @return array<int, mixed>
     */
    protected function passwordPolicy(): array
    {
        return ['required', 'string', Password::defaults()];
    }
}
