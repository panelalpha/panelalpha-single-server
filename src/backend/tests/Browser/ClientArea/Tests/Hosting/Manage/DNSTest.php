<?php

namespace Tests\Browser\ClientArea\Tests\Hosting\Manage;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;

use Tests\Browser\ClientArea\Pages\Hosting\Manage\DNSPage;
use Tests\Browser\ClientArea\Pages\Instances\InstancePage;
use Tests\Browser\ClientArea\Tests\Traits\InstanceTrait;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\DuskTestCase;
use Tests\Support\TestNetwork;
use PHPUnit\Framework\Attributes\Test;

class DNSTest extends DuskTestCase
{
    use UserTrait, InstanceTrait;

    protected function setUp(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old tests provisioned a WordPress instance through onboarding (DNSTest.php).'
        );
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group DNS
     * @return void
     */
    #[Test]
    public function can_sees_table(): void
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
                ->visit(new DNSPage())
                ->table();
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group DNS
     * @return void
     */
    #[Test]
    public function can_add_dns_record(): void
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
                ->visit(new DNSPage())
                ->addDNSRecord('test', TestNetwork::routable(1))
                ->successMessage('Success');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group DNS
     * @return void
     */
    #[Test]
    public function cannot_add_dns_record_with_incorrect_values(): void
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
                ->visit(new DNSPage())
                ->addDNSRecord(null, null)
                ->errorValidation('@name-required', 'Name Required.');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group DNS
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
                ->visit(new DNSPage())
                ->addDNSRecord('test', TestNetwork::routable(1))
                ->searchTerm('dusk')
                ->waitForTextIn('@table-empty', 'No matching records found')
                ->searchTerm(TestNetwork::routable(1))
                ->waitForTextIn('@name-first', 'test.')
                ->waitForTextIn('@ttl-first', '14400')
                ->waitForTextIn('@type-first', 'A')
                ->waitForTextIn('@value-first', TestNetwork::routable(1));
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group DNS
     * @return void
     */
    #[Test]
    public function can_edit_dns_record(): void
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
                ->visit(new DNSPage())
                ->editDNSRecord('example.com', '14401', TestNetwork::routable(1))
                ->successMessage('Success');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group DNS
     * @return void
     */
    #[Test]
    public function cannot_edit_dns_record_with_incorrect_value(): void
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
                ->visit(new DNSPage())
                ->editDNSRecord(null, null, null)
                ->errorValidation('@name-required', 'Name Required.');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group DNS
     * @return void
     */
    #[Test]
    public function can_delete_dns_record(): void
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
                ->visit(new DNSPage())
                ->deleteDNSRecord()
                ->successMessage('Success');
        });
    }
}
