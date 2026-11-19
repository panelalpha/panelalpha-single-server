<?php

namespace Tests\Browser\ClientArea\Pages\Hosting\Manage;

use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Page;

class CronPage extends Page
{
    /**
     * @return string
     */
    public function url(): string
    {
        return '/hosting/cron';
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
            ->waitFor('@cron-jobs');
    }

    /**
     * @return string[]
     */
    public function elements(): array
    {
        return [
            // General
            '@header' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.d-flex.align-center.col > h4',
            '@cron-jobs' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.sticky-sidebar.col-lg-2.col-12 > div > div:nth-child(2) > a.elevation-4--before.v-list-item--active.v-list-item.v-list-item--link.theme--light > div',
            '@search-term' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div.page-title__filter-controls.justify-end.col > div > div > div > div > div > div > div.v-text-field__slot > input',
            '@table' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div',
            // Empty
            '@empty-title' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div > table > tbody > tr > td > div > div.no-data__content > h4',
            '@empty-description' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div > table > tbody > tr > td > div > div.no-data__content > p',
            '@add-cron-job' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div > table > tbody > tr > td > div > div.no-data__content > div > button',
            // Add Cron Job Modal
            '@add-cron-job-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@add-cron-job-common' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(1) > div > div > div > div > div.v-select__slot > div.v-select__selections',
            '@add-cron-job-once-an-hour' => '#app > div.v-menu__content.theme--light.v-menu__content--fixed.menuable__content__active > div > div:nth-child(5)',
            '@add-cron-job-command' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(3) > div > div > div > div.v-input__slot > div > input',
            '@add-cron-job-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Table
            '@table-empty' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td',
            '@cron-expression-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(1)',
            '@description-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(2)',
            '@command-first' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(3)',
            // Actions
            '@edit-cron-job' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(4) > div > button:nth-child(1)',
            '@delete-cron-job' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div > div > div > div > div.v-data-table__wrapper > table > tbody > tr > td:nth-child(4) > div > button:nth-child(4)',
            // Edit Redirect URL Modal
            '@edit-cron-job-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@edit-cron-job-command' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div:nth-child(3) > div > div > div > div > div > input',
            '@edit-cron-job-update-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
            // Delete Cron Job Modal
            '@delete-cron-job-form' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__title.d-flex.justify-space-between',
            '@delete-cron-job-confirm' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__text > div > form > div > div > label > div > div > div > div > div',
            '@delete-cron-job-delete-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.basic-modal.v-card.v-sheet.theme--light.elevation-4 > div.v-card__actions.d-flex.flex-wrap.pb-4 > div:nth-child(1) > button',
        ];
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function empty(Browser $browser): void
    {
        $browser->waitForTextIn('@empty-title', 'No CRON Jobs Created')
            ->waitForTextIn('@empty-description', 'No Cron Jobs available.')
            ->waitFor('@add-cron-job');
    }

    /**
     * @param Browser $browser
     * @param string|null $command
     * @return void
     */
    public function addCronJob(Browser $browser, ?string $command): void
    {
        $browser->waitAndPress('@add-cron-job')
            ->waitFor('@add-cron-job-form')
            ->waitAndClick('@add-cron-job-common')
            ->waitAndClick('@add-cron-job-once-an-hour')
            ->waitAndType('@add-cron-job-command', $command)
            ->waitAndPress('@add-cron-job-btn');
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
     * @param string|null $command
     * @return void
     */
    public function editCronJob(Browser $browser, ?string $command): void
    {
        $browser->waitAndPress('@edit-cron-job')
            ->waitFor('@edit-cron-job-form')
            ->waitAndType('@edit-cron-job-command', $command)
            ->waitAndPress('@edit-cron-job-update-btn');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function deleteCronJob(Browser $browser): void
    {
        $browser->waitAndPress('@delete-cron-job')
            ->waitFor('@delete-cron-job-form')
            ->waitAndClick('@delete-cron-job-confirm')
            ->waitAndPress('@delete-cron-job-delete-btn');
    }
}
