<?php

namespace Tests\Browser\ClientArea\Tests\Instances;

use Laravel\Dusk\Browser;
use PHPUnit\Framework\Attributes\Test;
use Tests\Browser\ClientArea\Pages\Auth\LoginPage;
use Tests\Browser\ClientArea\Pages\Instances\InstancePage;
use Tests\Browser\ClientArea\Tests\Traits\InstanceTrait;
use Tests\Browser\ClientArea\Tests\Traits\UserTrait;
use Tests\Browser\Support\PanelClient;
use Tests\DuskTestCase;

/**
 * Ported from packages/api/tests/Browser/ClientArea/Tests/Instances/HomepageTest.php.
 * The single-user Community panel already sees every project on the shared Engine, so
 * the "no instances" cases cannot be arranged without touching `wordpress`.
 */
class HomepageTest extends DuskTestCase
{
    use UserTrait, InstanceTrait;

    /**
     * @group ClientArea
     * @group Instances
     */
    #[Test]
    public function can_see_homepage_without_instances(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old test needed a fresh user with no instances (HomepageTest.php:24-37); '
            .'the live Engine already hosts the non-e2e `wordpress` project.'
        );
    }

    /**
     * @group ClientArea
     * @group Instances
     */
    #[Test]
    public function can_see_clear_notifications(): void
    {
        $this->markLegacySelectorMismatch();

        $this->browse(function (Browser $browser) {
            $user = $this->setUser();
            $browser->visit(new LoginPage)
                ->logAsUser($user)
                ->visit(new InstancePage)
                ->checkNotifications('Everything is good!', 15);
        });

        // Legacy: HomepageTest.php:52-54 asserted the `notifications` table had
        // no `App\Models\User` rows; v1 reads the CA's own list endpoint.
        $this->assertSame([], PanelClient::instance()->notifications());
    }

    /**
     * @group ClientArea
     * @group Instances
     */
    #[Test]
    public function cannot_press_my_hosting_no_instances(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: the old test needed a fresh user with no instances (HomepageTest.php:62-75).'
        );
    }

    /**
     * @group ClientArea
     * @group Instances
     */
    #[Test]
    public function can_press_my_hosting_with_active_instance(): void
    {
        $this->markTestSkipped(
            'Legacy N/A: WordPress install is not on the deployed Engine.'
        );
    }
}
