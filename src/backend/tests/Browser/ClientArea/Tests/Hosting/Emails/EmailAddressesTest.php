<?php

namespace Tests\Browser\ClientArea\Tests\Hosting\Manage;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;
use Tests\Browser\ClientArea\Pages\Hosting\Emails\EmailAddressesPage;
use Tests\Browser\ClientArea\Pages\Instances\InstancePage;
use Tests\Browser\ClientArea\Tests\Traits\InstanceTrait;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\DuskTestCase;
use PHPUnit\Framework\Attributes\Test;

class EmailAddressesTest extends DuskTestCase
{
    use UserTrait, InstanceTrait;

    protected function setUp(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: email accounts are not part of v1 (EmailAddressesTest.php).'
        );
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Emails
     * @group EmailAddresses
     * @return void
     */
    #[Test]
    public function can_sees_empty_page(): void
    {
        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'standard', $server->id);
            $instance = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage())
                ->createService($user->id, $plan->id)
                ->createInstance($plan, $instance)
                ->visit(new EmailAddressesPage())
                ->empty();
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Emails
     * @group EmailAddresses
     * @return void
     */
    #[Test]
    public function can_search_term(): void
    {
        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'standard', $server->id);
            $instance = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage())
                ->createService($user->id, $plan->id)
                ->createInstance($plan, $instance)
                ->visit(new EmailAddressesPage())
                ->addEmailAccount('test', '512')
                ->searchTerm('dusk')
                ->waitForTextIn('@table-empty', 'No matching records found')
                ->searchTerm('test')
                ->waitForTextIn('@email-first', 'test@');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Emails
     * @group EmailAddresses
     * @return void
     */
    #[Test]
    public function can_add_email_account(): void
    {
        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'standard', $server->id);
            $instance = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage())
                ->createService($user->id, $plan->id)
                ->createInstance($plan, $instance)
                ->visit(new EmailAddressesPage())
                ->addEmailAccount('test', '512')
                ->successMessage('Success')
                ->waitForTextIn('@email-first', 'test@')
                ->waitForTextIn('@usage-first', '512.00 MB')
                ->waitForTextIn('@updated-first', 'a few seconds ago');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Emails
     * @group EmailAddresses
     * @return void
     */
    #[Test]
    public function cannot_add_email_account_with_incorrect_value(): void
    {
        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'standard', $server->id);
            $instance = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage())
                ->createService($user->id, $plan->id)
                ->createInstance($plan, $instance)
                ->visit(new EmailAddressesPage())
                ->waitAndPress('@add-email-account')
                ->waitFor('@add-email-account-form')
                ->waitAndPress('@add-email-account-btn')
                ->errorValidation('@add-email-account-email-required', 'Email Required.')
                ->errorValidation('@add-email-account-password-required', 'Password Required.');
        });
    }
}
