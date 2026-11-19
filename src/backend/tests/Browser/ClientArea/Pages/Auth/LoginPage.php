<?php

namespace Tests\Browser\ClientArea\Pages\Auth;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Page;
use App\Models\User;

class LoginPage extends Page
{
    /**
     * Get the URL for the page.
     *
     * @return string
     */
    public function url(): string
    {
        return '/login';
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
            '@email-address-required' => '#app > div > main > div > div.container.full-height-container.px-6 > div.row > div > div > div.v-card__text > form > div:nth-child(1) > div > div.v-text-field__details > div > div',
            '@password' => '#input-51',
            '@password-required' => '#app > div > main > div > div.container.full-height-container.px-6 > div.row > div > div > div.v-card__text > form > div:nth-child(2) > div > div.v-text-field__details > div > div',
            '@log-in' => '#app > div > main > div > div.container.full-height-container.px-6 > div.row > div > div > div.v-card__text > button',
            '@remember-me' => '#input-55',
            '@error-box' => '#app > div > main > div > div.container.full-height-container.px-6 > div.row > div > div > div.v-card__text > div.login-error-message.mb-6 > div.login-error-message__text-box > h6',
        ];
    }

    /**
     * @param Browser $browser
     * @param User $user
     * @return void
     */
    public function logAsUser(Browser $browser, User $user): void
    {
        $browser->waitForText('Welcome Back')
            ->type('@email-address', $user->email)
            ->type('@password', $user->password)
            ->press('@log-in')
            ->waitForText('Create Your First Instance', 10);
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function tooManyAttempts(Browser $browser): void
    {
        for ($i = 0; $i < 6; $i++) {
            $browser->pressAndWaitFor('Log In', 5);
        }
    }
}
