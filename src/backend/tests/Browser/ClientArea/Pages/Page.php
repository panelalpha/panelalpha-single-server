<?php

namespace Tests\Browser\ClientArea\Pages;

use Laravel\Dusk\Page as BasePage;
use Laravel\Dusk\Browser;

abstract class Page extends BasePage
{
    /**
     * Get the global element shortcuts for the site.
     *
     * @return array
     */
    public static function siteElements()
    {
        return [
            // Login
            '@auth-logo' => '#app > div > main > div > div.container.full-height-container.px-6 > div.row > div > a > div',
            // Navbar
            '@logo' => '#app > div > header > div > div > div > div.v-toolbar__title.d-flex.align-center > a > div',
            '@my-instances-active' => '#app > div > header > div > div > div > div.v-toolbar__title.d-flex.align-center > div > div > div.v-slide-group__wrapper > div > a.p-1.font-weight-600.top-bar__item.v-tab--active.v-tab',
            '@my-hosting-active' => '#app > div > header > div > div > div > div.v-toolbar__title.d-flex.align-center > div > div > div.v-slide-group__wrapper > div > a.p-1.font-weight-600.top-bar__item.v-tab--active.v-tab',
            '@notifications' => '#app > div.v-application--wrap > header > div > div > div > div.navbar__menu-items > button.v-btn.v-btn--icon.v-btn--outlined.v-btn--round.v-btn--rounded.theme--light.elevation-0.v-size--large.gray--text.ml-4 > span > span',
            // Header
            '@instances-header' => '#app > div > main > div > div.px-6 > div.container.px-0 > div > div.d-flex.align-center.justify-lg-start.justify-space-between > h1',
            '@hosting-header' => '#app > div > main > div > div:nth-child(2) > div:nth-child(1) > div > div > div > h1',
            // Messages
            '@message-title' => '#app > div > main > div > div.alert-manager.pt-4.pr-4 > span > div > div > div.alert__text-box > p:nth-child(1)',
            '@message-text' => '#app > div > main > div > div.alert-manager.pt-4.pr-4 > span > div > div > div.alert__text-box > p:nth-child(2)',
        ];
    }

    /**
     * @param Browser $browser
     * @param string $selector
     * @return void
     */
    public function clearElement(Browser $browser, string $selector): void
    {
        $value = $browser->value($selector);
        $browser->waitFor($selector)
            ->keys($selector, ...array_fill(0, strlen($value), '{backspace}'));
    }

    /**
     * @param Browser $browser
     * @param string $selector
     * @return void
     */
    public function waitAndPress(Browser $browser, string $selector): void
    {
        $browser->waitFor($selector, 60)
            ->press($selector);
    }

    /**
     * @param Browser $browser
     * @param string|null $selector
     * @return void
     */
    public function waitAndClick(Browser $browser, ?string $selector): void
    {
        $browser->waitFor($selector, 60)
            ->click($selector);
    }

    /**
     * @param Browser $browser
     * @param string|null $selector
     * @param string|null $type
     * @return void
     */
    public function waitAndType(Browser $browser, ?string $selector, ?string $type): void
    {
        $browser->waitFor($selector, 60)
            ->type($selector, $type);
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function refreshPage(Browser $browser): void
    {
        $browser->refresh()
            ->waitFor('@logo');
    }

    /**
     * @param Browser $browser
     * @param string $text
     * @param int $time
     * @return void
     */
    public function checkNotifications(Browser $browser, string $text, int $time): void
    {
        $browser->click('@notifications')
            ->waitForText($text, $time)
            ->click('@notifications');
    }

    /**
     * @param Browser $browser
     * @param string $selector
     * @param string $text
     * @return void
     */
    public function errorValidation(Browser $browser, string $selector, string $text): void
    {
        $browser->waitForTextIn($selector, $text);
    }

    /**
     * @param Browser $browser
     * @param string $message
     * @return void
     */
    public function successMessage(Browser $browser, string $message): void
    {
        $browser->waitForTextIn('@message-title', 'Success Message', 10)
            ->waitForTextIn('@message-text', $message)
            ->waitUntilMissing('@message-title', 10);
    }

    /**
     * @param Browser $browser
     * @param string $message
     * @return void
     */
    public function errorMessage(Browser $browser, string $message): void
    {
        $browser->waitForTextIn('@message-title', 'Error Message', 10)
            ->waitForTextIn('@message-text', $message)
            ->waitUntilMissing('@message-title', 10);
    }
}
