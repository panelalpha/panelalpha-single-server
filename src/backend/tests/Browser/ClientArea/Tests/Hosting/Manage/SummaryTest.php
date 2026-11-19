<?php

namespace Tests\Browser\ClientArea\Tests\Hosting\Manage;

use Illuminate\Database\Eloquent\Collection;
use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;
use Tests\Browser\ClientArea\Pages\Hosting\Manage\SummaryPage;
use Tests\Browser\ClientArea\Pages\Instances\InstancePage;
use Tests\Browser\ClientArea\Tests\Traits\InstanceTrait;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\DuskTestCase;
use PHPUnit\Framework\Attributes\Test;

class SummaryTest extends DuskTestCase
{
    use UserTrait, InstanceTrait;

    protected function setUp(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old tests provisioned a WordPress plan/instance through onboarding (SummaryTest.php); the deployed Engine has no wp/* endpoints and the shared Engine already hosts the non-e2e `wordpress` project, so a fresh single-service account cannot be arranged.'
        );
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Summary
     * @return void
     */
    #[Test]
    public function can_sees_summary_tab(): void
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
                ->visit(new SummaryPage())
                ->waitFor('@summary-tab-without-switcher')
                ->nameservers($instance['domain'])
                ->planUsage()
                ->hostingInstances($instance['site_name']);
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Summary
     * @return void
     */
    #[Test]
    public function can_sees_summary_tab_with_multiple_instances_and_plans(): void
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
                ->createInstance($plan, $instance);
            $plan2 = $this->setPlan('Standard', 'standard', $server->id);
            $instance2 = $this->generateFakeData();
            $instance3 = $this->generateFakeData();
            $browser->createService($user->id, $plan2->id)
                ->createInstance($plan2, $instance2)
                ->createinstance($plan2, $instance3)
                ->visit(new SummaryPage())
                ->waitFor('@summary-tab-with-switcher', 30)
                ->switchToSecondPlan()
                ->nameservers($instance2['domain'])
                ->planUsage()
                ->hostingInstances($instance2['site_name'])
                ->hostingInstances($instance3['site_name']);;
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Summary
     * @return void
     */
    #[Test]
    public function can_upgrade_hosting(): void
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
                ->visit(new SummaryPage())
                ->waitFor('@summary-tab-without-switcher', 30)
                ->upgrade($plan['config']['billing']['upgrade_link']);
        });
    }
}
