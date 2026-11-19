<?php

namespace Tests\Browser\ClientArea\Pages\MyAccount;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Page;

class MyAccountPage extends Page
{
    /**
     * Get the URL for the page.
     *
     * @return string
     */
    public function url(): string
    {
        return '/my-account';
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
            ->waitFor('@logo')
            ->waitFor('@personal-information-form');
    }

    /**
     * Get the element shortcuts for the page.
     *
     * @return array
     */
    public function elements(): array
    {
        return [
            // Personal Information
            '@personal-information-form' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div > form',
            '@first-name' => '#input-99',
            '@last-name' => '#input-102',
            '@company-name' => '#input-105',
            '@language' => '#input-109',
            '@email-address' => '#input-113',
            '@enter-password' => '#input-163',
            '@new-email-address' => '#input-167',

            // Change Email Address
            '@change-email-address-btn' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div > form > div.v-card__text.pa-6.pb-0 > div:nth-child(1) > div.pb-0.col-md-9.col-12.pt-6 > div:nth-child(2) > div:nth-child(2) > button',
            '@change-email-address-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div:nth-child(2)',
            '@change-email-address-save-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            '@password-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div.v-card__text > div > form > div:nth-child(1) > div > div > div > div.v-text-field__details > div > div',
            '@new-email-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div.v-text-field__details > div > div',

            // Change Password
            '@change-password-btn' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div > form > div.v-card__text.pa-6.pb-0 > div:nth-child(3) > div.col-sm-9.col-12.py-6 > div > div > button',
            '@change-password-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div:nth-child(2)',
            '@change-password-save-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            '@current-password' => '#input-163',
            '@new-password' => '#input-167',
            '@confirm-new-password' => '#input-171',
            '@current-password-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div.v-card__text > div > form > div:nth-child(1) > div > div > div > div.v-text-field__details > div > div',
            '@new-password-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div.v-text-field__details > div > div',
            '@confirm-new-password-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div.v-card__text > div > form > div:nth-child(3) > div > div > div > div.v-text-field__details > div > div',

            // Two Auth Factor
            '@code' => '#input-167',
            '@two-factor-authentication' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div > form > div.v-card__text.pa-6.pb-0 > div:nth-child(5) > div.pb-4.col-md-9.col-12.pt-6 > div > div:nth-child(1) > div',
            '@two-factor-authentication-QR-code' => 'g',
            '@two-factor-authentication-text' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div:nth-child(2) > form > div.v-card__text > p',
            '@two-factor-authentication-confirm-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div:nth-child(2) > form > div.v-card__actions.d-flex.flex-wrap.pb-4 > div.w-100.pb-2 > button',
            '@new-device-detection-notification' => '#app > div > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div > form > div.v-card__text.pa-6.pb-0 > div:nth-child(5) > div.pb-4.col-md-9.col-12.pt-6 > div > div:nth-child(2) > div > div > div > div.v-select__slot > div.v-select__selections',
            '@new-browser' => '#list-item-154-6',

            '@save-changes-btn' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div > form > div.v-card__actions.d-flex.justify-end > button',

            // Active Devices
            '@active-devices-tab' => '#app > div > main > div > div:nth-child(2) > div.container.pb-0 > div > div > div.v-slide-group__wrapper > div > div:nth-child(3)',
            '@active-devices-tab-table' => '#app > div > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div.v-window-item.v-window-item--active > div > div > div > div > div.v-data-table.elevation-0.custom-data-table.theme--light > div.v-data-table__wrapper > table > tbody',
            '@active-devices-tab-column-ip-address' => '#app > div > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div.v-window-item.v-window-item--active > div > div > div > div > div.v-data-table.elevation-0.custom-data-table.theme--light > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(2)',
            '@active-devices-tab-column-browser' => '#app > div > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div.v-window-item.v-window-item--active > div > div > div > div > div.v-data-table.elevation-0.custom-data-table.theme--light > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(3)',
            '@active-devices-tab-column-device' => '#app > div > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div.v-window-item.v-window-item--active > div > div > div > div > div.v-data-table.elevation-0.custom-data-table.theme--light > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(4)',
            '@active-devices-tab-column-last-login' => '#app > div > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div.v-window-item.v-window-item--active > div > div > div > div > div.v-data-table.elevation-0.custom-data-table.theme--light > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(5)',
            '@active-devices-tab-search-term' => '#app > div > main > div > div:nth-child(2) > div.container.pt-0 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div.v-text-field__slot > input',
            '@table-active-devices' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div.v-window-item.v-window-item--active > div > div > div > div > div.v-data-table.elevation-0.custom-data-table.theme--light > div.v-data-table__wrapper > table',
            '@forgot-device' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div.v-window-item.v-window-item--active > div > div > div > div > div.v-data-table.elevation-0.custom-data-table.theme--light > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(6) > div > button:nth-child(1) > span > span > svg',
            '@confirm-forgot-device' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div > div > label > div > div > div > div > label',
            '@delete-forgot-device' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            '@logout-device' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div.container.pt-0 > div.v-card.v-sheet.theme--light.elevation-4 > div > div > div.v-window-item.v-window-item--active > div > div > div > div > div.v-data-table.elevation-0.custom-data-table.theme--light > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(6) > div > button:nth-child(4)',
            '@confirm-logout-device' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div > div > label > div > div > div > div > label',
            '@delete-logout-device' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
        ];
    }

    /**
     * @param Browser $browser
     * @param string|null $password
     * @param string|null $email
     * @return void
     */
    public function changeEmail(Browser $browser, ?string $password, ?string $email): void
    {
        $browser->press('@change-email-address-btn')
            ->waitFor('@change-email-address-form')
            ->waitFor('@enter-password')
            ->type('@enter-password', $password)
            ->type('@new-email-address', $email)
            ->press('@change-email-address-save-btn');
    }

    /**
     * @param Browser $browser
     * @param string|null $password
     * @param string|null $nowPassword
     * @return void
     */
    public function changePassword(Browser $browser, ?string $password, ?string $nowPassword): void
    {
        $browser->press('@change-password-btn')
            ->waitFor('@change-password-form')
            ->type('@current-password', $password)
            ->type('@new-password', $nowPassword)
            ->type('@confirm-new-password', $nowPassword)
            ->press('@change-password-save-btn');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function enableTwoFactorAuth(Browser $browser): void
    {
        $browser->press('@two-factor-authentication')
            ->waitForTextIn('@two-factor-authentication-text', "Scan the above QR code using Google Authentificator or other app. If you can't access the scanner, please copy the following code manually into your application:")
            ->waitFor('@two-factor-authentication-QR-code');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function changeDetectionNotification(Browser $browser): void
    {
        $browser->waitFor('@new-device-detection-notification')
            ->click('@new-device-detection-notification')
            ->click('@new-browser');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function switchToActiveDevicesTab(Browser $browser): void
    {
        $browser->waitFor('@active-devices-tab')
            ->click('@active-devices-tab');
    }

    /**
     * @param Browser $browser
     * @param string|null $term
     * @return void
     */
    public function searchTermInActiveDevices(Browser $browser, ?string $term): void
    {

        $browser->waitFor('@active-devices-tab-search-term')
            ->clearElement('@active-devices-tab-search-term')
            ->type('@active-devices-tab-search-term', $term);
    }
}
