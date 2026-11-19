<?php

namespace Tests\Browser\ClientArea\Tests\Hosting\Manage;

use Illuminate\Database\Eloquent\Collection;
use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;
use Tests\Browser\ClientArea\Pages\Hosting\Manage\FTPPage;
use Tests\Browser\ClientArea\Pages\Instances\InstancePage;
use Tests\Browser\ClientArea\Tests\Traits\InstanceTrait;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\DuskTestCase;
use PHPUnit\Framework\Attributes\Test;

class FTPTest extends DuskTestCase
{
    use UserTrait, InstanceTrait;

    protected function setUp(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old tests provisioned a WordPress instance through onboarding (FTPTest.php).'
        );
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group FTP
     * @return void
     */
    #[Test]
    public function can_sees_no_account_created(): void
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
                ->visit(new FTPPage())
                ->empty();
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group FTP
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
                ->visit(new FTPPage())
                ->addAccount()
                ->waitAndType('@username', 'test')
                ->waitAndPress('@generate-password')
                ->waitAndType('@directory', 'test')
                ->waitAndClick('@unlimited-quota-unconfirmed')
                ->waitAndType('@quota', '512')
                ->waitAndPress('@add-account')
                ->searchTerm('dusk')
                ->waitForTextIn('@table-empty', 'No matching records found')
                ->searchTerm('test')
                ->waitForTextIn('@table-user', 'test@');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group FTP
     * @return void
     */
    #[Test]
    public function can_add_ftp_account_with_unlimited_quota(): void
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
                ->visit(new FTPPage())
                ->addAccount()
                ->waitAndType('@username', 'test')
                ->waitAndPress('@generate-password')
                ->waitAndType('@directory', 'test')
                ->waitAndClick('@unlimited-quota-unconfirmed')
                ->waitAndType('@quota', '512')
                ->waitAndPress('@add-account')
                ->successMessage('Success')
                ->waitForTextIn('@table-user', 'test@' . $instance['domain'])
                ->waitForTextIn('@table-directory', '/test')
                ->waitForTextIn('@table-usage', '0.00 MB')
                ->waitForTextIn('@table-quota', 'Unlimited')
                ->waitForTextIn('@table-updated', 'a few seconds ago');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group FTP
     * @return void
     */
    #[Test]
    public function can_add_ftp_account_with_limited_quota(): void
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
                ->visit(new FTPPage())
                ->addAccount()
                ->waitAndType('@username', 'test')
                ->waitAndPress('@generate-password')
                ->waitAndType('@directory', 'test')
                ->waitAndClick('@unlimited-quota-unconfirmed')
                ->waitAndType('@quota', '512')
                ->waitAndPress('@add-account')
                ->successMessage('Success')
                ->waitForTextIn('@table-user', 'test@' . $instance['domain'])
                ->waitForTextIn('@table-directory', '/test')
                ->waitForTextIn('@table-usage', '0.00 MB')
                ->waitForTextIn('@table-quota', '512 MB')
                ->waitForTextIn('@table-updated', 'a few seconds ago');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group FTP
     * @return void
     */
    #[Test]
    public function cannot_add_ftp_account_with_incorrect_quota(): void
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
                ->visit(new FTPPage())
                ->addAccount()
                ->waitAndType('@username', 'test')
                ->waitAndPress('@generate-password')
                ->waitAndType('@directory', 'test')
                ->waitAndClick('@unlimited-quota-unconfirmed')
                ->waitAndType('@quota', '0')
                ->waitAndPress('@add-account')
                ->errorMessage('quota: The quota must be greater than 0.');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group FTP
     * @return void
     */
    #[Test]
    public function can_sees_account_details(): void
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
                ->visit(new FTPPage())
                ->addAccount()
                ->waitAndType('@username', 'test')
                ->waitAndPress('@generate-password')
                ->waitAndType('@directory', 'test')
                ->waitAndClick('@unlimited-quota-unconfirmed')
                ->waitAndType('@quota', '512')
                ->waitAndPress('@add-account')
                ->ftpAccountDetails()
                ->waitForTextIn('@ftp-username', 'test@' . $instance['domain'])
                ->waitForTextIn('@ftp-host', $instance['domain'])
                ->waitForTextIn('@ftp-port', '21');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group FTP
     * @return void
     */
    #[Test]
    public function can_edit_ftp_account(): void
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
                ->visit(new FTPPage())
                ->addAccount()
                ->waitAndType('@username', 'test')
                ->waitAndPress('@generate-password')
                ->waitAndType('@directory', 'test')
                ->waitAndClick('@unlimited-quota-unconfirmed')
                ->waitAndType('@quota', '512')
                ->waitAndPress('@add-account')
                ->editFtpAccess()
                ->waitForTextIn('@edit-ftp-user', 'test@' . $instance['domain'])
                ->waitAndClick('@edit-ftp-set-new-password')
                ->waitAndClick('@edit-ftp-generate-password')
                ->waitAndType('@edit-ftp-quota', '1024')
                ->waitAndPress('@edit-ftp-update-btn')
                ->waitForTextIn('@table-updated', 'a few seconds ago')
                ->waitForTextIn('@table-quota', '1024 MB');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group FTP
     * @return void
     */
    #[Test]
    public function can_delete_account(): void
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
                ->visit(new FTPPage())
                ->addAccount()
                ->waitAndType('@username', 'test')
                ->waitAndPress('@generate-password')
                ->waitAndType('@directory', 'test')
                ->waitAndClick('@unlimited-quota-unconfirmed')
                ->waitAndType('@quota', '512')
                ->waitAndPress('@add-account')
                ->deleteAccount()
                ->waitAndClick('@delete-confirm')
                ->waitAndPress('@delete-btn')
                ->successMessage('Success')
                ->empty();
        });
    }
}
