<?php

namespace App\Actions\Users;

use App\Actions\Fortify\PasswordValidationRules;
use App\Models\User;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use PanelAlpha\ClientArea\Contracts\FirstUserCreator;

/**
 * The one place panel-user creation rules live: shared by `users:create` and
 * the first-run wizard.
 */
class CreateUser implements FirstUserCreator
{
    use PasswordValidationRules;

    /**
     * @throws \Illuminate\Validation\ValidationException
     */
    public function create(string $email, string $password, ?string $name = null): User
    {
        $email = strtolower(trim($email));

        Validator::make(
            ['email' => $email, 'password' => $password],
            [
                'email' => ['required', 'email', 'max:255', 'unique:users,email'],
                'password' => $this->passwordPolicy(),
            ],
        )->validate();

        return $this->store($email, $password, $name, false);
    }

    /**
     * The password is random, hashed by the model cast, and never returned or
     * logged; `password_generated` lets the user set their own without it.
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function createWithGeneratedPassword(string $email, ?string $name = null): User
    {
        $email = strtolower(trim($email));

        Validator::make(
            ['email' => $email],
            ['email' => ['required', 'email', 'max:255', 'unique:users,email']],
        )->validate();

        return $this->store($email, Str::password(40), $name, true);
    }

    private function store(string $email, string $password, ?string $name, bool $passwordGenerated): User
    {
        $name = $name === null ? '' : trim(preg_replace('/\s+/u', ' ', $name) ?? $name);
        $local = strstr($email, '@', true);
        $local = $local === false || $local === '' ? $email : $local;
        [$firstName, $lastName] = self::splitName($name === $local ? '' : $name);
        if ($name === '') {
            $name = $local;
        }

        $user = new User([
            'name' => $name,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $email,
            'password' => $password,
        ]);
        // Not mass-assignable on the model, so set it outside `fillable`.
        $user->email_verified_at = now();
        $user->password_generated = $passwordGenerated;
        $user->save();

        return $user;
    }

    /**
     * @return array{0: string|null, 1: string|null}
     */
    private static function splitName(string $name): array
    {
        if ($name === '') {
            return [null, null];
        }

        $parts = explode(' ', $name, 2);

        return [$parts[0], isset($parts[1]) && $parts[1] !== '' ? $parts[1] : null];
    }
}
