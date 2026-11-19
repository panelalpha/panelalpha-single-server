<?php

namespace Tests\Browser\ClientArea\Tests\Auth;

use Laravel\Dusk\Browser;
use PHPUnit\Framework\Attributes\Test;
use Tests\Browser\ClientArea\Pages\Auth\ForgotPasswordPage;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\DuskTestCase;

/**
 * Ported from packages/api/tests/Browser/ClientArea/Tests/Auth/ForgotPasswordTest.php
 * (the old file's namespace was missing the `Tests` prefix). The positive case
 * uses the live test user's email from DUSK_USER_FILE.
 */
class ForgotPasswordTest extends DuskTestCase
{
    use UserTrait;

    /**
     * @group ClientArea
     * @group Auth
     * @group ForgotPassword
     */
    #[Test]
    public function can_send_password_reset_link_with_correct_email(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $browser->visit(new ForgotPasswordPage)
                ->sendResetLink($user->email)
                ->successMessage('We have emailed your password reset link!');
        });
    }

    /**
     * @group ClientArea
     * @group Auth
     * @group ForgotPassword
     */
    #[Test]
    public function cannot_send_password_reset_link_with_incorrect_email(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $email = $this->generateFakeData();
            $browser->visit(new ForgotPasswordPage)
                ->sendResetLink($email)
                ->errorMessage("We can't find a user with that email address");
        });
    }

    /**
     * @group ClientArea
     * @group Auth
     * @group ForgotPassword
     */
    #[Test]
    public function cannot_send_password_reset_link_without_email(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $browser->visit(new ForgotPasswordPage)
                ->sendResetLink(null)
                ->waitForTextIn('@email-address-required', 'The email is required');
        });
    }

    /**
     * @group ClientArea
     * @group Auth
     * @group ForgotPassword
     */
    #[Test]
    public function can_click_false_alert_sign_in(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $browser->visit(new ForgotPasswordPage)
                ->waitForText('False alert?')
                ->click('a[href="/login"]')
                ->waitForLocation('/login');
        });
    }

    private function generateFakeData(): string
    {
        $faker = \Faker\Factory::create();

        return $faker->email();
    }
}
