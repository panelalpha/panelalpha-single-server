<?php

namespace Tests\Browser\ClientArea\Pages\Auth;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Page;

class ForgotPasswordPage extends Page
{
    /**
     * Get the URL for the page.
     *
     * @return string
     */
    public function url(): string
    {
        return '/forgot-password';
    }

    /**
     * Assert that the browser is on the page.
     *
     * @param Browser $browser
     * @return void
     */
    public function assert(Browser $browser): void
    {
        $browser->assertPathIs($this->url())
            ->waitFor('@auth-logo')
            ->waitFor('@form');
    }

    /**
     * Get the element shortcuts for the page.
     *
     * @return array
     */
    public function elements(): array
    {
        return [
            '@form' => '#app > div > main > div > div.container.full-height-container.px-6 > div.row > div > div',
            '@email-address' => '#input-48',
            '@email-address-required' => '#app > div > main > div > div.container.full-height-container.px-6 > div.row > div > div > div.v-card__text > form > div > div > div.v-text-field__details > div > div',
            '@send-reset-link-btn' => '#app > div > main > div > div.container.full-height-container.px-6 > div.row > div > div > div.v-card__text > form > button',
            '@message-title' => '#app > div > main > div > div.alert-manager.pt-4.pr-4 > span > div > div > div.alert__text-box > p:nth-child(1)',
            '@message-text' => '#app > div > main > div > div.alert-manager.pt-4.pr-4 > span > div > div > div.alert__text-box > p:nth-child(2)',
        ];
    }

    /**
     * @param Browser $browser
     * @param string|null $email
     * @return void
     */
    public function sendResetLink(Browser $browser, ?string $email): void
    {
        $browser->type('@email-address', $email)
            ->pressAndWaitFor('@send-reset-link-btn');
    }
}
