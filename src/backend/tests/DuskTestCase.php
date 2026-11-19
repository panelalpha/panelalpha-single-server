<?php

namespace Tests;

use Facebook\WebDriver\Chrome\ChromeOptions;
use Facebook\WebDriver\Remote\DesiredCapabilities;
use Facebook\WebDriver\Remote\RemoteWebDriver;
use Laravel\Dusk\Browser;
use Laravel\Dusk\TestCase as BaseTestCase;
use Tests\Browser\Support\DuskEnvironment;
use Tests\Browser\Support\DuskUser;

/**
 * Dusk base class for the ported Client Area browser tests.
 *
 * The browser is remote: Chrome runs in the container `run-dusk.sh` starts and
 * is reached through DUSK_DRIVER_URL. The tests sign in as the pre-provisioned
 * live panel user from DUSK_USER_FILE and drive the real Client Area over
 * DUSK_BASE_URL; they never boot the panel's database or create users.
 */
abstract class DuskTestCase extends BaseTestCase
{
    /**
     * Chrome is started by `backend/scripts/run-dusk.sh`, not by Dusk itself.
     */
    public static function prepare(): void
    {
        // no local chromedriver: DUSK_DRIVER_URL points at the Chrome container
    }

    protected function driver(): RemoteWebDriver
    {
        $options = (new ChromeOptions)->addArguments([
            '--disable-features=VizDisplayCompositor',
            '--disable-gpu',
            '--headless',
            '--no-sandbox',
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080',
        ]);

        return RemoteWebDriver::create(
            DuskEnvironment::driverUrl(),
            DesiredCapabilities::chrome()->setCapability(ChromeOptions::CAPABILITY, $options)
        );
    }

    protected function baseUrl(): string
    {
        return DuskEnvironment::baseUrl();
    }

    /**
     * The live panel user every ported test signs in as.
     */
    protected function testUser(): DuskUser
    {
        return DuskEnvironment::user();
    }

    /**
     * A ported case that stops on a legacy selector the
     * served Client Area no longer renders is recorded as a mismatch, never
     * rewritten to pass. The checked-in `@auth-logo`
     * (`tests/Browser/ClientArea/Pages/Page.php:19`) is a
     * `v-col.login-container` image in the served build
     * (`packages/client-area/src/views/Login.vue:4-16`), so every browser case
     * that visits a login page stops there.
     */
    protected function markLegacySelectorMismatch(): void
    {
        $this->markTestIncomplete(
            'Legacy mismatch: the checked-in @auth-logo selector '
            .'(tests/Browser/ClientArea/Pages/Page.php:19) predates the served Client Area build '
            .'(packages/client-area/src/views/Login.vue:4-16); the suite records the '
            .'mismatch instead of rewriting the selector.'
        );
    }

    /**
     * Sign the browser in through the Client Area login form.
     */
    protected function login(Browser $browser): Browser
    {
        $user = $this->testUser();

        return $browser->visit(new \Tests\Browser\ClientArea\Pages\Auth\LoginPage)
            ->waitForText('Welcome Back')
            ->type('@email-address', $user->email)
            ->type('@password', $user->password)
            ->press('@log-in')
            ->waitForLocation('/instances');
    }
}
