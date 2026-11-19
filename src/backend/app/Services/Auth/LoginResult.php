<?php

namespace App\Services\Auth;

use App\Models\User;

/**
 * Outcome of a login attempt (see LoginService). The controller turns the
 * status into the JSON the Client Area expects.
 */
final readonly class LoginResult
{
    public const USE_PASSWORD = 'use_password';

    public const TWO_FACTOR = 'two_factor';

    public const TWO_FACTOR_REFUSED = 'two_factor_refused';

    public const AUTHENTICATED = 'authenticated';

    public const ACCOUNT_EXISTS = 'account_exists';

    public const PASSWORD_SETUP = 'password_setup';

    /**
     * @param  array<string, bool>  $answer  the set-password step's JSON
     */
    private function __construct(
        public string $status,
        public ?User $user = null,
        public array $answer = [],
    ) {}

    /**
     * The edition's set-password step answered instead of the password step
     * (`set_password` or `verify_email`).
     *
     * @param  array<string, bool>  $answer
     */
    public static function passwordSetup(array $answer): self
    {
        return new self(self::PASSWORD_SETUP, answer: $answer);
    }

    public static function usePassword(): self
    {
        return new self(self::USE_PASSWORD);
    }

    public static function twoFactor(): self
    {
        return new self(self::TWO_FACTOR);
    }

    /**
     * A provider login for a user with 2FA enabled: the
     * unchanged CA cannot finish a challenge after a provider login, so the
     * social controller refuses it with the old-style key-0 422 instead.
     */
    public static function twoFactorRefused(): self
    {
        return new self(self::TWO_FACTOR_REFUSED);
    }

    public static function authenticated(User $user): self
    {
        return new self(self::AUTHENTICATED, $user);
    }

    /**
     * The provider identity may not be linked or signed in; the social
     * controller answers the old `account_already_exists` 422.
     */
    public static function accountExists(): self
    {
        return new self(self::ACCOUNT_EXISTS);
    }
}
