<?php

namespace Tests\Browser\ClientArea\Pages\Hosting\Manage;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Page;

class DatabasesPage extends Page
{
    /**
     * @return string
     */
    public function url(): string
    {
        return '/hosting/databases';
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
            ->waitFor('@mysql-databases')
            ->waitFor('@header-databases')
            ->waitFor('@table');
    }

    /**
     * @return string[]
     */
    public function elements(): array
    {
        return [
            '@header-databases' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.container.px-0 > div > div.d-flex.align-center.px-4.col > div > div > div.v-slide-group__wrapper > div > div.v-tab.v-tab--active',
            '@header-users' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.container.px-0 > div > div.d-flex.align-center.px-4.col > div > div > div.v-slide-group__wrapper > div > div.v-tab.v-tab--active',
            '@mysql-databases' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.sticky-sidebar.col-lg-2.col-12 > div > div:nth-child(2) > a.elevation-4--before.v-list-item--active.v-list-item.v-list-item--link.theme--light',
            '@table' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div',
            '@search-term' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.container.px-0 > div > div.page-title__filter-controls.justify-end.col > div > div > div > div > div > div > div.v-text-field__slot > input',
            '@add-database-btn' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.container.px-0 > div > div.page-title__filter-controls.justify-end.col > button',
            '@add-user-btn' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.container.px-0 > div > div.page-title__filter-controls.justify-end.col > button',
            // Tab
            '@database-tab' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.container.px-0 > div > div.d-flex.align-center.px-4.col > div > div > div.v-slide-group__wrapper > div > div:nth-child(2)',
            '@users-tab' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.container.px-0 > div > div.d-flex.align-center.px-4.col > div > div > div.v-slide-group__wrapper > div > div:nth-child(3)',
            // Databases Actions
            '@edit-database-name' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(4) > div > button:nth-child(1)',
            '@delete-database' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(4) > div > button:nth-child(4)',
            // Databases Table
            '@database-empty' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td',
            '@database-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(1)',
            '@size-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(2)',
            '@updated-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(3) > div > span',
            // Users Table
            '@users-empty' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td',
            '@user-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(1)',
            '@assigned-databases-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(2) > div > ul > li:nth-child(1) > button > span > span',
            '@updated-users-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr:nth-child(1) > td:nth-child(3) > div > span',
            // Users Actions
            '@manage-privileges' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr.highlight > td:nth-child(4) > div > button:nth-child(1)',
            '@edit-user' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr.highlight > td:nth-child(4) > div > button:nth-child(4)',
            '@show-access-details' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr.highlight > td:nth-child(4) > div > button:nth-child(6)',
            '@delete-user' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > div > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr.highlight > td:nth-child(4) > div > button:nth-child(8)',
            // Add Database Modal
            '@add-database-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@add-database-new-database' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div > div > div > div > div > div > input',
            '@add-database' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Add User Modal
            '@add-user-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@add-user-username' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > div > div > div > div > input',
            '@add-user-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div > div > input',
            '@add-user-generate-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > button:nth-child(3)',
            '@add-user' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Edit Database Modal
            '@edit-database-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@edit-database-new-name' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div > div > div > div > div > div > input',
            '@edit-database-update' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Delete Database Modal
            '@delete-database-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@delete-database-confirm' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div > div > label > div > div > div > div > div',
            '@delete-database-delete' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Manage Privileges Modal
            '@manage-privileges-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@manage-privileges-database' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > div > div > div > div.v-select__slot > div.v-select__selections',
            '@manage-privileges-privileges' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div > div.v-select__slot > div.v-select__selections',
            '@manage-privileges-update-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            '@manage-privileges-privileges-full' => '#app > div.v-menu__content.theme--light.v-menu__content--fixed.menuable__content__active > div > div:nth-child(4)',
            // Edit User Modal
            '@edit-user-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@edit-user-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > div > div > div > div > input',
            '@edit-user-set-new-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > button',
            '@edit-user-generate-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(2) > div > button:nth-child(3)',
            '@edit-user-username' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(3) > div > div > div > div > div > input',
            '@edit-user-update-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Show Access Details Modal
            '@access-details-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@access-details-user' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > p > ul > li:nth-child(1) > span',
            '@access-details-host' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > p > ul > li:nth-child(2) > span',
            '@access-details-port' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > p > ul > li:nth-child(3) > span',
            '@access-details-cancel' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div > button',
            // Delete User Modal
            '@delete-user-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@delete-user-confirm' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div > div > label > div > div > div > div > div',
            '@delete-user-delete' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button'
        ];
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

    /**
     * @param Browser $browser
     * @return void
     */
    public function switchToDatabases(Browser $browser): void
    {
        $browser->waitAndClick('@database-tab');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function switchToUsers(Browser $browser): void
    {
        $browser->waitAndClick('@users-tab');
    }

    /**
     * @param Browser $browser
     * @param string|null $name
     * @return void
     */
    public function addDatabase(Browser $browser, ?string $name): void
    {
        $browser->waitAndPress('@add-database-btn')
            ->waitFor('@add-database-form')
            ->waitAndType('@add-database-new-database', $name)
            ->waitAndPress('@add-database');
    }

    /**
     * @param Browser $browser
     * @param string|null $username
     * @return void
     */
    public function addUsers(Browser $browser, ?string $username): void
    {
        $browser->waitAndPress('@add-user-btn')
            ->waitFor('@add-user-form')
            ->waitAndType('@add-user-username', $username)
            ->waitAndClick('@add-user-generate-password')
            ->waitAndPress('@add-user');
    }

    /**
     * @param Browser $browser
     * @param string|null $name
     * @return void
     */
    public function editDatabaseName(Browser $browser, ?string $name): void
    {
        $browser->waitAndPress('@edit-database-name')
            ->waitFor('@edit-database-form')
            ->waitAndType('@edit-database-new-name', $name)
            ->waitAndPress('@edit-database-update');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function deleteDatabase(Browser $browser): void
    {
        $browser->waitAndPress('@delete-database')
            ->waitFor('@delete-database-form')
            ->waitAndClick('@delete-database-confirm')
            ->waitAndPress('@delete-database-delete');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function managePrivileges(Browser $browser): void
    {
        $browser->waitAndPress('@manage-privileges')
            ->waitFor('@manage-privileges-form')
            ->waitAndClick('@manage-privileges-privileges')
            ->waitAndClick('@manage-privileges-privileges-full')
            ->waitAndPress('@manage-privileges-update-btn');
    }

    /**
     * @param Browser $browser
     * @param string|null $username
     * @return void
     */
    public function editUser(Browser $browser, ?string $username): void
    {
        $browser->waitAndPress('@edit-user')
            ->waitFor('@edit-user-form')
            ->waitAndPress('@edit-user-set-new-password')
            ->waitAndPress('@edit-user-generate-password')
            ->waitAndType('@edit-user-username', $username)
            ->waitAndPress('@edit-user-update');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function accessDetails(Browser $browser): void
    {
        $browser->waitAndPress('@show-access-details')
            ->waitFor('@access-details-form')
            ->waitFor('@access-details-user')
            ->waitFor('@access-details-host')
            ->waitFor('@access-details-port')
            ->waitAndPress('@access-details-cancel');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function deleteUser(Browser $browser): void
    {
        $browser->waitAndPress('@delete-user-form')
            ->waitAndClick('@delete-user-confirm')
            ->waitAndPress('@delete-user-delete');
    }
}
