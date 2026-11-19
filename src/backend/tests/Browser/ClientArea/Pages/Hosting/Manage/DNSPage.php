<?php

namespace Tests\Browser\ClientArea\Pages\Hosting\Manage;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Page;

class DNSPage extends Page
{
    /**
     * @return string
     */
    public function url(): string
    {
        return '/hosting/dns';
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
            ->waitForTextIn('@header', 'DNS Zone')
            ->waitFor('@dns-zone-editor')
            ->waitFor('@table');
    }

    /**
     * @return string[]
     */
    public function elements(): array
    {
        return [
            '@header' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.d-flex.align-center.col > h4',
            '@dns-zone-editor' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.sticky-sidebar.col-lg-2.col-12 > div > div:nth-child(2) > a.elevation-4--before.v-list-item--active.v-list-item.v-list-item--link.theme--light > div',
            '@search-term' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.page-title__filter-controls.justify-end.col > div > div > div > div > div > div > div.v-text-field__slot > input',
            '@add-dns-record' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.page-title__filter-controls.justify-end.col > button',
            '@table' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div',
            // Table
            '@table-empty' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td',
            '@name-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(1) > a',
            '@name-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div.v-text-field__details > div > div > div',
            '@ttl-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(2)',
            '@type-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(3)',
            '@value-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(4)',
            // Actions
            '@edit-dns-record' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(5) > div > button:nth-child(1)',
            '@delete-dns-record' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(5) > div > button:nth-child(4)',
            // Add DNS Record Modal
            '@add-dns-record-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@add-dns-record-name' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div.v-input__slot > div > input',
            '@add-dns-record-address' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(4) > div > div > div > div > div > input',
            '@add-dns-record-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Edit DNS Record Modal
            '@edit-dns-record-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@edit-dns-record-name' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div > div > input',
            '@edit-dns-record-ttl' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(3) > div > div > div > div > div > input',
            '@edit-dns-record-address' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(4) > div > div > div > div > div > input',
            '@edit-dns-record-update-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Delete DNS Record
            '@delete-dns-record-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@delete-dns-record-confirm' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div > div > label > div > div > div > div > div',
            '@delete-dns-record-delete-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
        ];
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function table(Browser $browser): void
    {
        $browser->waitFor('@name-first')
            ->waitFor('@ttl-first')
            ->waitFor('@type-first')
            ->waitFor('@value-first')
            ->waitFor('@edit-dns-record')
            ->waitFor('@delete-dns-record');
    }

    /**
     * @param Browser $browser
     * @param string|null $name
     * @param string|null $address
     * @return void
     */
    public function addDNSRecord(Browser $browser, ?string $name, ?string $address): void
    {
        $browser->waitAndPress('@add-dns-record')
            ->waitFor('@add-dns-record-form')
            ->waitAndType('@add-dns-record-name', $name)
            ->waitAndType('@add-dns-record-address', $address)
            ->waitAndPress('@add-dns-record-btn');
    }

    /**
     * @param Browser $browser
     * @param string|null $term
     * @return void
     */
    public function searchTerm(Browser $browser, ?string $term): void
    {
        $browser->waitFor('@search-term')
            ->clearElement('@search-term')
            ->waitAndType('@search-term', $term);
    }

    /**
     * @param Browser $browser
     * @param string|null $name
     * @param string|null $ttl
     * @param string|null $address
     * @return void
     */
    public function editDNSRecord(Browser $browser, ?string $name, ?string $ttl, ?string $address)
    {
        $browser->waitAndPress('@edit-dns-record')
            ->waitFor('@edit-dns-record-form')
            ->clearElement('@edit-dns-record-name')
            ->waitAndType('@edit-dns-record-name', $name)
            ->clearElement('@edit-dns-record-ttl')
            ->waitAndType('@edit-dns-record-ttl', $ttl)
            ->clearElement('@edit-dns-record-address')
            ->waitAndType('@edit-dns-record-address', $address)
            ->waitAndPress('@edit-dns-record-update-btn');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function deleteDNSRecord(Browser $browser): void
    {
        $browser->waitAndPress('@delete-dns-record')
            ->waitFor('@delete-dns-record-form')
            ->waitAndClick('@delete-dns-record-confirm')
            ->waitAndPress('@delete-dns-record-delete-btn');
    }
}
