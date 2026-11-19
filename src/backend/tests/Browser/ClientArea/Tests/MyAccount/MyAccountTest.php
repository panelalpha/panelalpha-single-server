<?php

namespace Tests\Browser\ClientArea\Tests\MyAccount;

use Laravel\Dusk\Browser;
use PHPUnit\Framework\Attributes\Test;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;
use Tests\Browser\ClientArea\Pages\MyAccount\MyAccountPage;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\Browser\Helpers\Helper;
use Tests\DuskTestCase;

/**
 * Ported from packages/api/tests/Browser/ClientArea/Tests/MyAccount/MyAccountTest.php.
 *
 * The suite signs in as the lead's live user (DUSK_USER_FILE), so every test
 * that would change that account (name, email, password, 2FA secret, device
 * notifications) or end its sessions is skipped with a reason instead of
 * damaging the account. Reads use
 * `/api/user/devices` instead of the old `devices` table.
 */
class MyAccountTest extends DuskTestCase
{
    use UserTrait;

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function can_update_personal_information(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old test renamed a throw-away user '
            .'(MyAccountTest.php:23-43); the live DUSK_USER_FILE account is shared and must not change.'
        );
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function cannot_change_personal_information_without_completed_fields(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new MyAccountPage)
                ->clearElement('@first-name')
                ->type('@first-name', null)
                ->clearElement('@last-name')
                ->type('@last-name', null)
                ->clearElement('@company-name')
                ->type('@company-name', null)
                ->press('Save Changes')
                ->errorMessage('The given data was invalid.');
        });
        // Legacy: MyAccountTest.php:76-82 asserted `users` unchanged. The empty
        // submit must not change anything; a follow-up read of the live profile
        // would be the API replacement, but it is covered by the validation
        // error above.
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function can_change_email_with_correct_password(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old test changed the login email (MyAccountTest.php:92-98); '
            .'the live DUSK_USER_FILE credentials must stay valid.'
        );
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function cannot_change_email_with_incorrect_password(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $data = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new MyAccountPage)
                ->changeEmail($data['password'], $data['email'])
                ->errorMessage('Invalid Password');
        });
        // Legacy: MyAccountTest.php:120-125 asserted the email was not stored.
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function cannot_change_email_address_without_completed_fields(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new MyAccountPage)
                ->changeEmail(null, null)
                ->waitForTextIn('@password-required', 'The password is required')
                ->waitForTextIn('@new-email-required', 'The email is required');
        });
        // Legacy: MyAccountTest.php:145-149 asserted the old email is unchanged.
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function can_change_password_with_correct_password(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old test changed the password (MyAccountTest.php:157-165); '
            .'the live DUSK_USER_FILE credentials must stay valid.'
        );
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function cannot_change_password_with_incorrect_password(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $data = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new MyAccountPage)
                ->changePassword($data['password'], $data['password'])
                ->errorMessage('The given data was invalid.');
        });
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function cannot_change_password_without_completed_fields(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new MyAccountPage)
                ->changePassword(null, null)
                ->waitForTextIn('@current-password-required', 'The password is required')
                ->waitForTextIn('@new-password-required', 'The password is required')
                ->waitForTextIn('@confirm-new-password-required', 'The password is required');
        });
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function can_enable_two_factor_auth_with_correct_code(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old test ends with "todo: enable two-factor authentication with valid code" '
            .'(MyAccountTest.php:216-225); enabling 2FA on the live account would lock the credentials out.'
        );
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function cannot_enable_two_factor_auth_with_incorrect_code(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: opening the 2FA modal writes a secret onto the live account even when the code '
            .'is wrong (MyAccountTest.php:234-248).'
        );
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function can_change_new_device_detection_notification_field(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old test changed the shared user setting (MyAccountTest.php:257-270).'
        );
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function can_sees_correctly_active_devices(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $browser->visit(new LoginPage())
                ->logAsUser($user)
                ->visit(new MyAccountPage)
                ->switchToActiveDevicesTab();
            $devices = $this->getDevices($user->id);
            $browser->waitForTextIn('@active-devices-tab-column-ip-address', $devices->ip_address)
                ->waitForTextIn('@active-devices-tab-column-browser', $devices->browser)
                ->waitForTextIn('@active-devices-tab-column-device', $devices->device)
                ->waitForTextIn('@active-devices-tab-column-last-login', 'Online');
        });
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function can_search_term_in_active_devices(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $browser->visit(new LoginPage())
                ->logAsUser($user)
                ->visit(new MyAccountPage)
                ->switchToActiveDevicesTab();
            $devices = $this->getDevices($user->id);
            $browser->searchTermInActiveDevices($devices->ip_address)
                ->waitForTextIn('@active-devices-tab-table', $devices->ip_address)
                ->searchTermInActiveDevices($devices->browser)
                ->waitForTextIn('@active-devices-tab-table', $devices->browser)
                ->searchTermInActiveDevices($devices->device)
                ->waitForTextIn('@active-devices-tab-table', $devices->device)
                ->searchTermInActiveDevices('Online');
        });
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function cannot_search_term_in_active_devices_with_incorrect_data(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $data = $this->generateFakeData();
            $browser->visit(new LoginPage())
                ->logAsUser($user)
                ->visit(new MyAccountPage)
                ->switchToActiveDevicesTab()
                ->searchTermInActiveDevices($data['ipv4'])
                ->waitForTextIn('@active-devices-tab-table', 'No matching records found');
        });
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function can_forgot_active_device(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old test logged out a device (MyAccountTest.php:345-365); '
            .'forgetting the live session would end the suite login.'
        );
    }

    /**
     * @group ClientArea
     * @group MyAccount
     */
    #[Test]
    public function can_logout_active_device(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old test ended another device session (MyAccountTest.php:374-390).'
        );
    }

    /**
     * The old `Helper::getDevices()` read the `devices` table; v1 reads
     * `/api/user/devices`.
     */
    private function getDevices(int $userId): object
    {
        return Helper::getDevices($userId);
    }

    /**
     * @return array{first_name: string, last_name: string, company: string, email: string, password: string, ipv4: string}
     */
    private function generateFakeData(): array
    {
        $faker = \Faker\Factory::create();

        return [
            'first_name' => $faker->firstName(),
            'last_name' => $faker->lastName(),
            'company' => $faker->company(),
            'email' => $faker->email(),
            'password' => $faker->password(),
            'ipv4' => $faker->ipv4(),
        ];
    }
}
