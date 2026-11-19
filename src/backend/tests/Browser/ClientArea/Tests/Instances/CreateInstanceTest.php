<?php

namespace Tests\Browser\ClientArea\Tests\Instances;

use Laravel\Dusk\Browser;
use PHPUnit\Framework\Attributes\Test;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;
use Tests\Browser\ClientArea\Pages\Instances\InstancePage;
use Tests\Browser\ClientArea\Tests\Traits\InstanceTrait;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\DuskTestCase;

/**
 * Ported from packages/api/tests/Browser/ClientArea/Tests/Instances/CreateInstanceTest.php.
 *
 * Every case drives the WordPress onboarding; the deployed Engine does not carry
 * the `wp/*` endpoints yet, so these are N/A. The old
 * steps are kept in each method so the port is visible.
 */
class CreateInstanceTest extends DuskTestCase
{
    use UserTrait, InstanceTrait;

    /**
     * @group ClientArea
     * @group Instances
     * @group CreateInstance
     */
    #[Test]
    public function cannot_create_instance_no_active_plan(): void
    {
        $this->skipWordPressInstall();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->press('@add-new-instance-btn')
                ->click('@create-new-wordpress-instance')
                ->press('@continue-btn')
                ->waitForText('No Active Plans')
                ->waitForText('Order New Plan');
        });
    }

    /**
     * @group ClientArea
     * @group Instances
     * @group CreateInstance
     */
    #[Test]
    public function cannot_create_instance_quick_onboarding_without_name(): void
    {
        $this->skipWordPressInstall();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'quick', $server->id);
            $instance = ['site_name' => null];
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->createService($user->id, $plan->id)
                ->createInstance($plan, $instance);
        });
    }

    /**
     * @group ClientArea
     * @group Instances
     * @group CreateInstance
     */
    #[Test]
    public function can_create_instance_quick_onboarding(): void
    {
        $this->skipWordPressInstall();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'quick', $server->id);
            $instance = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->createService($user->id, $plan->id)
                ->createInstance($plan, $instance);
        });
    }

    /**
     * @group ClientArea
     * @group Instances
     * @group CreateInstance
     */
    #[Test]
    public function cannot_create_instance_standard_onboarding_no_fields(): void
    {
        $this->skipWordPressInstall();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'standard', $server->id);
            $instance = ['site_name' => null, 'domain' => null];
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->createService($user->id, $plan->id)
                ->createInstance($plan, $instance);
        });
    }

    /**
     * @group ClientArea
     * @group Instances
     * @group CreateInstance
     */
    #[Test]
    public function can_create_instance_standard_onboarding_without_advanced_and_theme(): void
    {
        $this->skipWordPressInstall();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'standard', $server->id, false, false);
            $instance = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->createService($user->id, $plan->id)
                ->createInstance($plan, $instance);
        });
    }

    /**
     * @group ClientArea
     * @group Instances
     * @group CreateInstance
     */
    #[Test]
    public function can_create_instance_standard_onboarding_with_advanced_without_theme(): void
    {
        $this->skipWordPressInstall();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'standard', $server->id, false, true);
            $instance = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->createService($user->id, $plan->id)
                ->createInstance($plan, $instance);
        });
    }

    /**
     * @group ClientArea
     * @group Instances
     * @group CreateInstance
     */
    #[Test]
    public function can_create_instance_standard_onboarding_with_theme_without_advanced(): void
    {
        $this->skipWordPressInstall();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'standard', $server->id, true, false);
            $instance = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->createService($user->id, $plan->id)
                ->createInstance($plan, $instance);
        });
    }

    /**
     * @group ClientArea
     * @group Instances
     * @group CreateInstance
     */
    #[Test]
    public function can_create_instance_standard_onboarding_with_theme_and_advanced(): void
    {
        $this->skipWordPressInstall();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $server = $this->setServer();
            $plan = $this->setPlan('Premium', 'standard', $server->id, true, true);
            $instance = $this->generateFakeData();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->createService($user->id, $plan->id)
                ->createInstance($plan, $instance);
        });
    }

    private function skipWordPressInstall(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: WordPress install/onboarding is not on the deployed Engine '
            .'(CreateInstanceTest.php).'
        );
    }
}
