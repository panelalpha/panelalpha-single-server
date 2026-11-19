<?php

namespace Tests\Browser\ClientArea\Tests\Hosting\Manage;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;
use Tests\Browser\ClientArea\Pages\Hosting\Manage\DatabasesPage;
use Tests\Browser\ClientArea\Pages\Instances\InstancePage;
use Tests\Browser\ClientArea\Tests\Traits\InstanceTrait;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\DuskTestCase;
use PHPUnit\Framework\Attributes\Test;

class DatabasesTest extends DuskTestCase
{
  use UserTrait, InstanceTrait;

    protected function setUp(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old tests provisioned a WordPress instance through onboarding (DatabasesTest.php).'
        );
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function can_sees_databases_and_users(): void
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
                ->visit(new DatabasesPage())
                ->waitFor('@database-first')
                ->waitFor('@size-first')
                ->waitFor('@updated-first')
                ->switchToUsers()
                ->waitFor('@user-first')
                ->waitFor('@assigned-databases-first')
                ->waitFor('@updated-users-first');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function can_search_term_in_databases_and_users(): void
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
                ->visit(new DatabasesPage())
                ->searchTerm('dusk')
                ->waitForTextIn('@database-empty', 'No matching records found')
                ->switchToUsers()
                ->searchTerm('dusk')
                ->waitForTextIn('@users-empty', 'No matching records found');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function can_add_database(): void
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
                ->visit(new DatabasesPage())
                ->addDatabase('test')
                ->successMessage('Success')
                ->waitForTextIn('@database-first', 'test');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function cannot_add_database_without_name(): void
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
                ->visit(new DatabasesPage())
                ->addDatabase(null)
                ->errorMessage('name: The name field is required.');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function can_edit_database_name(): void
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
                ->visit(new DatabasesPage())
                ->editDatabaseName('edit')
                ->successMessage('Success')
                ->waitForTextIn('@database-first', 'edit');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function cannot_edit_database_name_with_same_value(): void
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
                ->visit(new DatabasesPage())
                ->editDatabaseName(null)
                ->errorMessage('UAPI Errors: The “oldname” and “newname” parameters cannot be the same value.');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function can_delete_database(): void
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
                ->visit(new DatabasesPage())
                ->deleteDatabase()
                ->successMessage('Success')
                ->waitForText('No Databases Created')
                ->waitForText('No databases available.');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function can_add_users(): void
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
                ->visit(new DatabasesPage())
                ->switchToUsers()
                ->addUsers('test')
                ->successMessage('Success')
                ->waitForTextIn('@user-first', 'test');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function cannot_add_user_without_name(): void
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
                ->visit(new DatabasesPage())
                ->switchToUsers()
                ->addUsers(null)
                ->errorMessage('name: The name field is required.');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function can_manage_privileges(): void
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
                ->visit(new DatabasesPage())
                ->switchToUsers()
                ->addUsers('test')
                ->managePrivileges()
                ->successMessage('Success')
                ->waitFor('@assigned-databases-first');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function can_edit_user(): void
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
                ->visit(new DatabasesPage())
                ->switchToUsers()
                ->addUsers('test')
                ->editUser('edit')
                ->successMessage('Success');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function can_show_access_details(): void
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
                ->visit(new DatabasesPage())
                ->switchToUsers()
                ->addUsers('test')
                ->accessDetails();
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Databases
     * @return void
     */
    #[Test]
    public function can_delete_user(): void
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
                ->visit(new DatabasesPage())
                ->switchToUsers()
                ->addUsers('test')
                ->deleteUser()
                ->successMessage('Success')
                ->waitForText('No Users created')
                ->waitForText('No database users available.');
        });
    }
}
