<?php

namespace Tests\Browser\ClientArea\Tests\Hosting\Manage;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;
use Tests\Browser\ClientArea\Pages\Hosting\Manage\DomainsPage;
use Tests\Browser\ClientArea\Pages\Instances\InstancePage;
use Tests\Browser\ClientArea\Tests\Traits\InstanceTrait;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\Browser\Helpers\Helper;
use Tests\DuskTestCase;
use PHPUnit\Framework\Attributes\Test;

class DomainsTest extends DuskTestCase
{
    use UserTrait, InstanceTrait;

    protected function setUp(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old tests provisioned a WordPress instance through onboarding (DomainsTest.php).'
        );
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Domains
     * @return void
     */
    #[Test]
    public function can_sees_created_domain_in_table(): void
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
                ->visit(new DomainsPage())
                ->waitForTextIn('@domain-first', $instance['domain']);
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Domains
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
                ->visit(new DomainsPage())
                ->addDomain('test.example.com')
                ->searchTerm('test-test')
                ->waitForTextIn('@no-matching-record-found', 'No matching records found')
                ->clearElement('@search-term')
                ->searchTerm($instance['domain'])
                ->waitForTextIn('@domain-first', $instance['domain']);
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Domains
     * @return void
     */
    #[Test]
    public function can_add_domain_with_correct_domain(): void
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
                ->visit(new DomainsPage())
                ->addDomain('test-domain.com')
                ->successMessage('Success')
                ->waitForTextIn('@domain-first', 'test-domain.com')
                ->waitForTextIn('@domain-second', $instance['domain']);

            // Legacy: DomainsTest.php asserted the old `domains` table; v1 has no such table (the Domains page reads E:/domains).
            $this->assertDatabaseHas('domains', [
                'user_id' => $user->id,
                'server_account_id' => 1,
                'domain' => 'test-domain.com'
            ]);
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Domains
     * @return void
     */
    #[Test]
    public function cannot_add_domain_with_incorrect_domain(): void
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
                ->visit(new DomainsPage())
                ->addDomain(null)
                ->errorValidation('@domain-required', 'Domain Required.');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Domains
     * @return void
     */
    #[Test]
    public function can_add_subdomain_with_correct_subdomain(): void
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
                ->visit(new DomainsPage())
                ->addSubDomain('subdomain')
                ->successMessage('Success')
                ->waitForTextIn('@domain-first', 'subdomain.' . $instance['domain'])
                ->waitForTextIn('@domain-second', $instance['domain']);

            // Legacy: DomainsTest.php asserted the old `domains` table; v1 has no such table (the Domains page reads E:/domains).
            $this->assertDatabaseHas('domains', [
                'user_id' => $user->id,
                'server_account_id' => 1,
                'domain' => 'subdomain.' . $instance['domain'],
                'type' => 'sub'
            ]);
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Domains
     * @return void
     */
    #[Test]
    public function cannot_add_subdomain_with_incorrect_subdomain(): void
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
                ->visit(new DomainsPage())
                ->addSubDomain(null)
                ->errorValidation('@domain-subdomain-required', 'Domain Required.');

            // Legacy: DomainsTest.php asserted the old `domains` table; v1 has no such table.
            $this->assertDatabaseMissing('domains', [
                'user_id' => $user->id,
                'domain' => '.' . $instance['domain'],
                'type' => 'sub'
            ]);
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Domains
     * @return void
     */
    #[Test]
    public function can_edit_ssl(): void
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
                ->visit(new DomainsPage())
                ->editSSL()
                ->waitForTextIn('@edit-ssl-domain', $instance['domain'])
                ->waitAndClick('@edit-ssl-select')
                ->waitAndClick('@edit-ssl-generate-free-undefined-cert')
                ->waitAndPress('@edit-ssl-save-btn')
                ->successMessage('SSL Settings Updated')
                ->waitForTextIn('@domain-first', $instance['domain'])
                ->waitForTextIn('@domain-first-ssl-status', "In Progress");

            // Legacy: DomainsTest.php asserted the old `ssl_orders` table; v1 reads the Engine certificate.
            $this->assertDatabaseHas('ssl_orders', [
                'user_id' => $user->id,
                'user_domain' => $instance['domain'],
                'status' => 'pending'
            ]);
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Domains
     * @return void
     */
    #[Test]
    public function can_edit_domain(): void
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
                ->visit(new DomainsPage())
                ->editDomain()
                ->waitAndClick('@edit-domain-redirect-confirm')
                ->waitAndType('@edit-domain-redirect-url', 'redirect.example.com')
                ->waitAndPress('@edit-domain-update-btn')
                ->successMessage('Success')
                ->waitForTextIn('@domain-first', $instance['domain'])
                ->waitForTextIn('@domain-first-redirect-url', "redirect.example.com");

            // Legacy: DomainsTest.php asserted the old `domains` table; v1 has no such table (the Domains page reads E:/domains).
            $this->assertDatabaseHas('domains', [
                'user_id' => $user->id,
                'domain' => $instance['domain'],
                'redirect_enabled' => 1,
                'redirect_url' => 'http://redirect.example.com/',
                'type' => 'main'
            ]);
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Domains
     * @return void
     */
    #[Test]
    public function cannot_delete_main_domain(): void
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
                ->visit(new DomainsPage())
                ->waitUntilMissing('@delete-domain');

            // Legacy: DomainsTest.php asserted the old `domains` table; v1 has no such table (the Domains page reads E:/domains).
            $this->assertDatabaseHas('domains', [
                'user_id' => $user->id,
                'domain' => $instance['domain'],
                'type' => 'main'
            ]);
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Domains
     * @return void
     */
    #[Test]
    public function can_delete_new_addon_domain(): void
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
                ->visit(new DomainsPage())
                ->addDomain('test-domain.com')
                ->waitFor('@delete-domain')
                ->deleteDomain()
                ->successMessage('Success');

            // Legacy: DomainsTest.php asserted the old `domains` table; v1 has no such table.
            $this->assertDatabaseMissing('domains', [
                'id' => 2,
                'user_id' => $user->id,
                'server_account_id' => 1,
                'domain' => 'test-domain.com',
                'type' => 'addon'
            ]);
        });
    }
}
