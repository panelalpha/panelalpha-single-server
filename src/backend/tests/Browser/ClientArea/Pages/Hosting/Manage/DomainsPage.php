<?php

namespace Tests\Browser\ClientArea\Pages\Hosting\Manage;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Page;

class DomainsPage extends Page
{
    /**
     * @return string
     */
    public function url(): string
    {
        return '/hosting/domains';
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
                ->waitForTextIn('@title', 'Domains')
                ->waitFor('@active-domains')
                ->waitFor('@table');
    }

    /**
     * @return string[]
     */
    public function elements(): array
    {
        return [
            // Header
            '@title' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.d-flex.align-center.col > h4',
            '@active-domains' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.sticky-sidebar.col-lg-2.col-12 > div > div:nth-child(2) > a.elevation-4--before.v-list-item--active.v-list-item.v-list-item--link.theme--light',
            '@table' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div',
            '@search-term' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.page-title__filter-controls.justify-end.col > div > div > div > div > div > div > div.v-text-field__slot > input',
            '@add-domain-btn' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.page-title__filter-controls.justify-end.col > button',
            '@no-matching-record-found' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td',
            // Add Domain Modal
            '@add-domain-modal' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@domain-new' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > div > div > div.v-input__slot > div > input',
            '@domain-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > div > div > div.v-text-field__details > div > div > div',
            '@domain-type' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(3) > div > div > div > div > div.v-select__slot > div.v-input__append-inner > div > span > div',
            '@domain-type-subdomain' => '#app > div.v-menu__content.theme--light.v-menu__content--fixed.menuable__content__active > div > div:nth-child(2)',
            '@domain-subdomain-input' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div.v-input.v-input--md.text-select-input__text-input.v-input--hide-details.v-input--dense.theme--light.v-text-field.v-text-field--is-booted.v-text-field--enclosed.v-text-field--outlined > div > div > div > input',
            '@domain-subdomain-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div.v-input.v-input--md.text-select-input__text-input.v-input--has-state.v-input--dense.theme--light.v-text-field.v-text-field--is-booted.v-text-field--enclosed.v-text-field--outlined.error--text > div > div.v-text-field__details > div > div > div',
            '@add-domain-new-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Table
            '@domain' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tr > td.sort-item.item--domain > div',
            '@domain-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(1) > div > div > a',
            '@domain-first-ssl-status' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(2) > div > span',
            '@domain-first-redirect-url' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(1) > div > span > a',
            '@domain-first-document-root' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(4) > span',
            '@domain-second' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(2) > td:nth-child(1) > div > div > a',
            '@ssl-status' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tr > td.sort-item.item--ssl.status > div',
            '@type' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tr > td.sort-item.item--type > div',
            '@document-root' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tr > td.sort-item.item--document.root > div',
            '@nameservers' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(1) > div > div > button',
            '@domain-secured' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(2) > div > span.v-icon.notranslate.theme--light.success--text',
            '@ssl-is-enabled' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(3) > td:nth-child(2) > div > span.v-icon.notranslate.theme--light.error--text',
            // Actions
            '@edit-ssl' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(5) > div > button:nth-child(1)',
            '@edit-domain' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(5) > div > button:nth-child(4)',
            '@edit-domain-2' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(2) > td:nth-child(5) > div > button:nth-child(4)',
            '@delete-domain' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(5) > div > button:nth-child(6)',
            // Edit SSL Modal
            '@edit-ssl-modal' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@edit-ssl-domain' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > p > strong',
            '@edit-ssl-select' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > div > div > div > div.v-select__slot > div.v-input__append-inner > div',
            '@edit-ssl-generate-free-undefined-cert' => '#app > div.v-menu__content.theme--light.v-menu__content--fixed.menuable__content__active > div > div:nth-child(3)',
            '@edit-ssl-purchase' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > div',
            '@edit-ssl-save-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4.pt-8 > div:nth-child(1) > button',
            // Edit Domain Modal
            '@edit-domain-modal' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@edit-domain-document-root' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > div > div > div > div > input',
            '@edit-domain-redirect-confirm' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > label > div > div > div > div > div',
            '@edit-domain-redirect-url' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(3) > div > div > div > div > div > input',
            '@edit-domain-update-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Delete Domain Modal
            '@delete-domain-modal' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@delete-domain-confirm' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div > div > label > div > div > div > div > div > input',
            '@delete-domain-delete-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
        ];
    }

    /**
     * @param Browser $browser
     * @param string $term
     * @return void
     */
    public function searchTerm(Browser $browser, string $term): void
    {
        $browser->type('@search-term', $term);
    }

    /**
     * @param Browser $browser
     * @param string|null $domain
     * @return void
     */
    public function addDomain(Browser $browser, ?string $domain): void
    {
        $browser->waitAndPress('@add-domain-btn')
            ->waitFor('@add-domain-modal')
            ->waitAndType('@domain-new', $domain)
            ->waitAndPress('@add-domain-new-btn');
    }

    public function addSubDomain(Browser $browser, ?string $subdomain): void
    {
        $browser->waitAndPress('@add-domain-btn')
            ->waitFor('@add-domain-modal')
            ->click('@domain-type')
            ->waitAndClick('@domain-type-subdomain')
            ->waitAndType('@domain-subdomain-input', $subdomain)
            ->waitAndPress('@add-domain-new-btn');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function editSSL(Browser $browser): void
    {
        $browser->waitAndPress('@edit-ssl')
            ->waitFor('@edit-ssl-modal');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function editDomain(Browser $browser): void
    {
        $browser->waitAndPress('@edit-domain')
            ->waitFor('@edit-domain-modal');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function deleteDomain(Browser $browser): void
    {
        $browser->waitAndPress('@delete-domain')
            ->waitFor('@delete-domain-modal')
            ->click('@delete-domain-confirm')
            ->waitAndPress('@delete-domain-delete-btn');
    }
}
