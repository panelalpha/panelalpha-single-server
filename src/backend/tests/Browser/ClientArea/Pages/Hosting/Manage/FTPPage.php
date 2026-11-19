<?php

namespace Tests\Browser\ClientArea\Pages\Hosting\Manage;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Page;

class FTPPage extends Page
{
    /**
     * @return string
     */
    public function url(): string
    {
        return '/hosting/ftp';
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function assert(Browser $browser)
    {
        $browser->assertPathIs($this->url())
            ->waitFor('@logo')
            ->waitFor('@my-hosting-active')
            ->waitForTextIn('@hosting-header', 'Your Hosting')
            ->waitForTextIn('@title', 'FTP Accounts')
            ->waitFor('@ftp-accounts-tab')
            ->waitFor('@table');
    }

    /**
     * @return string[]
     */
    public function elements(): array
    {
        return [
            // General
            '@title' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.d-flex.align-center.col > h4',
            '@ftp-accounts-tab' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.sticky-sidebar.col-lg-2.col-12 > div > div:nth-child(2) > a.elevation-4--before.v-list-item--active.v-list-item.v-list-item--link.theme--light',
            '@table' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div',
            '@search-term-input' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.page-title__filter-controls.justify-end.col > div > div > div > div > div > div > div.v-text-field__slot > input',
            '@add-account-btn' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.page-title__filter-controls.justify-end.col > button',
            // Empty table
            '@empty-table-title' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div > table > tbody > tr > td > div > div.no-data__content > h4',
            '@empty-table-description' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div > table > tbody > tr > td > div > div.no-data__content > p',
            '@empty-table-button' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div > table > tbody > tr > td > div > div.no-data__content > div > button',
            // Table
            '@table-user' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(1) > b',
            '@table-directory' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(2)',
            '@table-usage' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(3) > div > span > b',
            '@table-quota' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(3) > div > span > span',
            '@table-updated' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(4) > div > span',
            '@table-empty' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td',
            // Actions
            '@show-access-details' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(5) > div > button:nth-child(1)',
            '@edit-ftp-access' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(5) > div > button:nth-child(4)',
            '@delete-account' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(5) > div > button:nth-child(6)',
            // Add FTP Account
            '@add-ftp-account-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@username' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > div > div.v-input.v-input--md.text-select-input__text-input.v-input--hide-details.v-input--dense.theme--light.v-text-field.v-text-field--is-booted.v-text-field--enclosed.v-text-field--outlined > div > div > div > input',
            '@username-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > div > div.v-input.v-input--md.text-select-input__text-input.v-input--has-state.v-input--dense.theme--light.v-text-field.v-text-field--is-booted.v-text-field--enclosed.v-text-field--outlined.error--text > div > div.v-text-field__details > div > div > div',
            '@password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div > div > input',
            '@password-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div.v-text-field__details > div > div > div',
            '@generate-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > button:nth-child(3)',
            '@directory' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(3) > div > div > div > div > div > input',
            '@unlimited-quota-unconfirmed' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(4) > div > label > div > div > div > div > div',
            '@quota' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(5) > div > div > div > div > div > input',
            '@add-account' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // FTP Account Login Details
            '@ftp-login-details-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@ftp-username' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > p > ul > li:nth-child(1) > span',
            '@ftp-host' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > p > ul > li:nth-child(2) > span',
            '@ftp-port' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > p > ul > li:nth-child(3) > span',
            // Edit FTP Account
            '@edit-ftp-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@edit-ftp-user' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > p',
            '@edit-ftp-set-new-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > button',
            '@edit-ftp-generate-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > button:nth-child(3)',
            '@edit-ftp-unlimited-quota-confirm' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(3) > div > label > div > div > div > div > div',
            '@edit-ftp-quota' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(4) > div > div > div > div > div > input',
            '@edit-ftp-update-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Delete Account
            '@delete-account-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@delete-confirm' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div > div > label > div > div > div > div > div',
            '@delete-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
        ];
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function empty(Browser $browser): void
    {
        $browser->waitForTextIn('@empty-table-title', 'No Account Created')
            ->waitForTextIn('@empty-table-description', 'No FTP accounts available.')
            ->waitFor('@empty-table-button');
    }

    /**
     * @param Browser $browser
     * @param string|null $message
     * @return void
     */
    public function searchTerm(Browser $browser, ?string $message): void
    {
        $browser->clearElement('@search-term-input')
            ->waitAndType('@search-term-input', $message);
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function addAccount(Browser $browser): void
    {
        $browser->press('@empty-table-button')
            ->waitFor('@add-ftp-account-form');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function ftpAccountDetails(Browser $browser): void
    {
        $browser->waitAndPress('@show-access-details')
            ->waitFor('@ftp-login-details-form');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function editFtpAccess(Browser $browser): void
    {
        $browser->waitAndPress('@edit-ftp-access')
            ->waitFor('@edit-ftp-form');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function deleteAccount(Browser $browser): void
    {
        $browser->waitAndPress('@delete-account')
            ->waitFor('@delete-account-form');
    }
}
