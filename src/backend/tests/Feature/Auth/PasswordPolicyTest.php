<?php

namespace Tests\Feature\Auth;

use App\Actions\Fortify\PasswordValidationRules;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

/**
 * The single panel-user password policy.
 *
 * Exercises the shared rules exactly as the reset/change actions use them –
 * via `PasswordValidationRules::passwordRules()` and `Password::defaults()`
 * (set in AppServiceProvider).
 * @see App\Actions\Fortify\PasswordValidationRules
 */
class PasswordPolicyTest extends TestCase
{
    public function test_each_policy_rule_rejects_with_a_password_error(): void
    {
        $this->assertPasswordRejected('Ab1!', 'at least 8 characters'); // min
        $this->assertPasswordRejected(str_repeat('Aa1!', 70), 'not be greater than 255 characters'); // max
        $this->assertPasswordRejected('12345678!', 'at least one letter');
        $this->assertPasswordRejected('abcdefg1!', 'at least one uppercase and one lowercase');
        $this->assertPasswordRejected('Abcdefg!', 'at least one number');
        $this->assertPasswordRejected('Abcdefg1', 'at least one symbol');
    }

    public function test_confirmation_must_match(): void
    {
        $validator = $this->validator('Valid-Password1!', 'Other-Password1!');

        $this->assertTrue($validator->fails());
        $this->assertArrayHasKey('password', $validator->errors()->toArray());
    }

    public function test_a_valid_password_passes(): void
    {
        $this->assertFalse($this->validator('Valid-Password1!', 'Valid-Password1!')->fails());
    }

    public function test_the_policy_makes_no_http_request_when_uncompromised_is_off(): void
    {
        Http::fake();

        $this->assertFalse(config('auth.password_uncompromised'));
        $this->assertFalse($this->validator('Valid-Password1!', 'Valid-Password1!')->fails());

        // `uncompromised()` would call the external HIBP API; it must stay off.
        Http::assertNothingSent();
    }

    private function validator(string $password, string $confirmation): ValidatorContract
    {
        // The real trait, not a copy of its rules.
        $rules = new class
        {
            use PasswordValidationRules;

            /**
             * @return array<int, mixed>
             */
            public function rules(): array
            {
                return $this->passwordRules();
            }
        };

        return Validator::make(
            ['password' => $password, 'password_confirmation' => $confirmation],
            ['password' => $rules->rules()],
        );
    }

    private function assertPasswordRejected(string $password, string $message): void
    {
        $validator = $this->validator($password, $password);

        $this->assertTrue($validator->fails(), "Expected [$password] to be rejected.");
        $this->assertStringContainsString($message, implode(' ', $validator->errors()->get('password')));
    }
}
