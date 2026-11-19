<?php

namespace Tests\Browser\ClientArea\Pages\Hosting\Emails;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Page;

class EmailAddressesPage extends Page
{
    /**
     * @return string
     */
    public function url(): string
    {
        return '/hosting/email-addresses';
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function assert(Browser $browser)
    {
        $browser->assertPathIs($this->url())
            ->waitFor('@logo')
            ->waitForTextIn('@hosting-header', 'Your Hosting')
            ->waitForTextIn('@header', 'Email Addresses')
            ->waitFor('@email-address-active');
    }

    /**
     * @return string[]
     */
    public function elements(): array
    {
        return [
            // General
            '@header' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.d-flex.align-center.col > h4',
            '@email-address-active' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.sticky-sidebar.col-lg-2.col-12 > div > div:nth-child(4) > a.elevation-4--before.v-list-item--active.v-list-item.v-list-item--link.theme--light > div',
            '@search-term' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.page-title__filter-controls.justify-end.col > div > div > div > div > div > div > div.v-text-field__slot > input',
            // Table
            '@table' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div',
            '@table-empty' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td',
            '@email-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(1)',
            '@usage-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(2)',
            '@updated-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(3) > div > span',
            // Actions
            '@edit-accounts' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(4) > div > button:nth-child(1)',
            '@show-details' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(4) > div > button:nth-child(4)',
            '@delete-account' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(4) > div > button:nth-child(6)',
            '@log-in-to-webmail' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(4) > div > button:nth-child(8)',
            // Empty
            '@empty-title' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div > table > tbody > tr > td > div > div.no-data__content > h4',
            '@empty-description' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div > table > tbody > tr > td > div > div.no-data__content > p',
            '@add-email-account' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div > table > tbody > tr > td > div > div.no-data__content > div > button',
            // Add Email Account Modal
            '@add-email-account-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between > h5',
            '@add-email-account-email' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > div > div.v-input.v-input--md.text-select-input__text-input.v-input--hide-details.v-input--dense.theme--light.v-text-field.v-text-field--is-booted.v-text-field--enclosed.v-text-field--outlined > div > div > div > input',
            '@add-email-account-email-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > div > div.v-input.v-input--md.text-select-input__text-input.v-input--has-state.v-input--dense.theme--light.v-text-field.v-text-field--is-booted.v-text-field--enclosed.v-text-field--outlined.error--text > div > div.v-text-field__details > div > div > div',
            '@add-email-account-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div > div > input',
            '@add-email-account-password-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div.v-text-field__details > div > div > div',
            '@add-email-account-generate-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > button:nth-child(3)',
            '@add-email-account-unlimited-quota' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(3) > div > label > div > div',
            '@add-email-account-quota' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(4) > div > div > div > div > div > input',
            '@add-email-account-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Edit Email Account Modal
            '@edit-email-account-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@edit-email-account-set-new-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > button',
            '@edit-email-account-generate-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > button:nth-child(3)',
            '@edit-email-account-unlimited-quota' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(3) > div > label > div > div > div > div > div',
            '@edit-email-account-quota' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(4) > div > div > div > div > div > input',
            '@edit-email-account-update-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
        ];
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function empty(Browser $browser): void
    {
        $browser->waitForTextIn('@empty-title', 'No Email Addresses Created')
            ->waitForTextIn('@empty-description', 'No Email Addresses available.')
            ->waitFor('@add-email-account');
    }

    /**
     * @param Browser $browser
     * @param string|null $email
     * @param int|null $quota
     * @return void
     */
    public function addEmailAccount(Browser $browser, ?string $email, ?int $quota): void
    {
        $browser->waitAndPress('@add-email-account')
            ->waitFor('@add-email-account-form')
            ->waitAndType('@add-email-account-email', $email)
            ->waitAndPress('@add-email-account-generate-password')
            ->waitAndClick('@add-email-account-unlimited-quota')
            ->waitAndType('@add-email-account-quota', $quota)
            ->waitAndPress('@add-email-account-btn');
    }

    /**
     * @param Browser $browser
     * @param string|null $term
     * @return void
     */
    public function searchTerm(Browser $browser, ?string $term): void
    {
        $browser->clearElement('@search-term')
            ->waitAndType('@search-term', $term);
    }
}
