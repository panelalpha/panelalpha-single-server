<?php

namespace Tests\Browser\ClientArea\Tests\Auth;

use Laravel\Dusk\Browser;
use PHPUnit\Framework\Attributes\Test;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\DuskTestCase;

/**
 * Ported from packages/api/tests/Browser/ClientArea/Tests/Auth/LoginTest.php.
 * The suite signs in as the live test user from DUSK_USER_FILE instead of
 * creating one.
 */
class LoginTest extends DuskTestCase
{
    use UserTrait;

    /**
     * @group ClientArea
     * @group Auth
     * @group Login
     */
    #[Test]
    public function can_login_with_correct_credentials(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $browser->visit(new LoginPage())
                ->logAsUser($user)
                ->waitForLocation('/instances');
        });
    }

    /**
     * @group ClientArea
     * @group Auth
     * @group Login
     */
    #[Test]
    public function cannot_login_with_incorrect_credentials(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $data = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->type('@email-address', $data['email'])
                ->type('@password', $data['password'])
                ->press('@log-in')
                ->waitForTextIn('@error-box', 'The provided credentials are incorrect');
        });
    }

    /**
     * @group ClientArea
     * @group Auth
     * @group Login
     */
    #[Test]
    public function cannot_login_without_credentials(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $browser->visit(new LoginPage)
                ->type('@email-address', null)
                ->type('@password', null)
                ->press('@log-in')
                ->waitForTextIn('@email-address-required', 'The email is required')
                ->waitForTextIn('@password-required', 'The password is required');
        });
    }

    /**
     * @group ClientArea
     * @group Auth
     * @group Login
     */
    #[Test]
    public function cannot_login_too_many_attempts(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $data = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->type('@email-address', $data['email'])
                ->type('@password', $data['password'])
                ->tooManyAttempts()
                ->waitForTextIn('@error-box', 'Too Many Attempts');
        });
    }

    /**
     * @return array{email: string, password: string}
     */
    private function generateFakeData(): array
    {
        $faker = \Faker\Factory::create();

        return [
            'email' => $faker->email(),
            'password' => $faker->password(),
        ];
    }
}
