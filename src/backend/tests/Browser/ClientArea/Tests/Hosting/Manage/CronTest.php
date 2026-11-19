<?php

namespace Tests\Browser\ClientArea\Tests\Hosting\Manage;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;
use Tests\Browser\ClientArea\Pages\Hosting\Manage\CronPage;
use Tests\Browser\ClientArea\Pages\Instances\InstancePage;
use Tests\Browser\ClientArea\Tests\Traits\InstanceTrait;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\DuskTestCase;
use PHPUnit\Framework\Attributes\Test;

class CronTest extends DuskTestCase
{
    use UserTrait, InstanceTrait;

    protected function setUp(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old tests provisioned a WordPress instance through onboarding (CronTest.php).'
        );
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Cron
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
                ->visit(new CronPage())
                ->empty();
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Cron
     * @return void
     */
    #[Test]
    public function can_add_cron(): void
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
                ->visit(new CronPage())
                ->addCronJob('test')
                ->waitFor('@cron-expression-first')
                ->waitFor('@description-first')
                ->waitForTextIn('@command-first', 'test');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Cron
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
                ->visit(new CronPage())
                ->addCronJob('test')
                ->searchTerm('dusk')
                ->waitForTextIn('@table-empty', 'No matching records found')
                ->searchTerm('test')
                ->waitForTextIn('@command-first', 'test');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Cron
     * @return void
     */
    #[Test]
    public function can_edit_cron_job(): void
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
                ->visit(new CronPage())
                ->addCronJob('test')
                ->editCronJob('edit')
                ->successMessage('Success')
                ->waitForTextIn('@command-first', 'edit');
        });
    }

    /**
     * @group ClientArea
     * @group Hosting
     * @group Manage
     * @group Cron
     * @return void
     */
    #[Test]
    public function can_delete_cron_job(): void
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
                ->visit(new CronPage())
                ->addCronJob('test')
                ->deleteCronJob()
                ->successMessage('Success')
                ->empty();
        });
    }
}
