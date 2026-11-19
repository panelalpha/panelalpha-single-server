<?php

namespace Tests\Browser\ClientArea\Pages\Instances;

use Laravel\Dusk\Browser;
use Illuminate\Support\Str;
use Tests\Browser\ClientArea\Pages\Page;

class InstancePage extends Page
{
    /**
     * Get the URL for the page.
     *
     * @return string
     */
    public function url(): string
    {
        return '/instances';
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
            ->waitFor('@logo');
    }

    /**
     * Get the element shortcuts for the page.
     *
     * @return array
     */
    public function elements(): array
    {
        return [
            // General
            '@add-new-instance-btn' => '#app > div > header > div > div > div > div.navbar__menu-items > button.p-2.font-weight-bold.v-btn.v-btn--has-bg.theme--light.elevation-0.v-size--large.primary',
            '@create-new-wordpress-instance' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-8.pt-8 > div.selection-box > div.checkbox-big.pa-6.checkbox-big--checked',
            '@import-existing-wordpress-instance' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-8.pt-8 > div.selection-box > div:nth-child(2)',
            '@continue-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__actions.pt-8.d-flex.align-center.justify-space-between > div.d-flex.align-center > button.v-btn.v-btn--has-bg.theme--light.elevation-0.v-size--large.primary',
            '@success-text' => '#app > div.v-application--wrap > main > div > div.px-6 > div:nth-child(3) > div.container.px-0 > div > div > div > div > div:nth-child(1) > div > div > div.v-card__actions.justify-space-between.pt-3 > div:nth-child(1) > a > div:nth-child(1) > div',
            '@my-hosting' => '#app > div > header > div > div > div > div.v-toolbar__title.d-flex.align-center > div > div > div.v-slide-group__wrapper > div > a:nth-child(3)',
            '@my-hosting-disabled' => '#app > div > header > div > div > div > div.v-toolbar__title.d-flex.align-center > div > div > div.v-slide-group__wrapper > div > a.p-1.font-weight-600.top-bar__item.v-tab.v-tab--disabled',
            '@multiple-services' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-10.pt-8 > form > div > div > div > div.v-select__slot > div.v-input__append-inner',
            '@choose-product' => '#app > div.v-menu__content.theme--light.v-menu__content--fixed.custom-dropdown-select.custom-dropdown-select--onboarding > div > div:nth-child(2)',
            '@set-website-name-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__actions.d-flex.flex-column.pb-4.px-10.pt-2 > button',

            // Quick Onboarding
            '@use-this-theme' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div > div > div.row.no-gutters > div.col-sm-12.col-md-9.col-lg-10.col.pl-12.pl-6 > div.v-data-iterator.d-flex.mx-4.flex-wrap.flex-row > div > div:nth-child(11) > div > div > div.template-card__actions > button > span > span',
            '@set-website-name' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-10.pt-8 > form > div > div > div > div > input',
            '@set-website-name-error' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-10.pt-8 > form > div',
            '@create-site' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__actions.d-flex.flex-column.pb-4.px-10.pt-2 > button.v-btn.v-btn--block.v-btn--has-bg.theme--light.elevation-0.v-size--x-large.primary',
            '@manage-your-site-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div > div > div.d-flex.pt-8 > button.primary.v-size--xx-large.mb-10.v-btn.v-btn--has-bg.theme--light.elevation-0.v-size--x-large.primary.ml-3',

            // Standard Onboarding
            '@new-installation-site-name' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div > form > div.row.no-gutters > div.pb-0.d-flex.flex-column.col.col-12 > div > div > div.v-input__slot > div > input',
            '@new-installation-domain' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div > form > div.row.no-gutters > div.py-0.d-flex.flex-column.col.col-12 > div > div.v-input.v-input--md.v-input--hide-details.v-input--dense.theme--light.v-text-field.v-text-field--is-booted.v-text-field--enclosed.v-text-field--outlined.v-text-field--placeholder > div > div > div > input',
            '@new-installation-subdomain-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div > form > div.row.no-gutters > div.py-0.d-flex.flex-column.col.col-12 > div > button',
            '@new-installation-subdomain' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div > form > div.row.no-gutters > div.py-0.d-flex.flex-column.col.col-12 > div > div.d-flex > div.v-input.v-input--md.v-input--hide-details.v-input--dense.theme--light.v-text-field.v-text-field--is-booted.v-text-field--enclosed.v-text-field--outlined.v-text-field--placeholder > div > div > div.v-text-field__slot > input',
            '@new-clean-installation' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div > form > div.tabs-container > div.v-tabs.pb-4.theme--light > div > div.v-slide-group__wrapper > div > div.v-tabs-slider-wrapper',
            '@install-from-template' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div > form > div.tabs-container > div.v-tabs.pb-4.theme--light > div > div.v-slide-group__wrapper > div > div.p-1.v-tab.v-tab--disabled',
            '@clone-existing-installation' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div > form > div.tabs-container > div.v-tabs.pb-4.theme--light > div > div.v-slide-group__wrapper > div > div.p-1.v-tab.v-tab--active',
            '@advanced-configuration-tab' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-tabs.mb-6.theme--light > div > div.v-slide-group__wrapper > div > div:nth-child(3)',
            '@language' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > form > div > div.pb-0.d-flex.flex-column.col.col-12 > div > div > div.v-input__slot > div.v-select__slot > div.v-select__selections > div',
            '@language-polish' => '#list-item-675-23 > div',
            '@administrator-username' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > form > div > div.py-0.pr-2.d-flex.flex-column.col.col-6 > div > div > div > div > input',
            '@administrator-email' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > form > div > div.py-0.pl-2.d-flex.flex-column.col.col-6 > div > div > div > div > input',
            '@administrator-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div.v-window-item.v-window-item--active > form > div > div.py-0.d-flex.flex-column.col.col-12 > div > div > div > div > div > input',
            '@standard-onboarding-continue-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__actions.px-8.py-8.d-flex.align-center.justify-space-between > div.d-flex > button.v-btn.v-btn--has-bg.theme--light.elevation-0.v-size--large.primary',

            // New Installation Modal
            '@new-installation-form' => '',
            '@new-installation-site-name-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div > form > div.row.no-gutters > div.pb-0.d-flex.flex-column.col.col-12 > div > div > div.v-text-field__details > div > div > div',
            '@new-installation-domain-required' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light.elevation-8 > div.v-card__text.px-8.pt-8 > div.v-window.v-item-group.theme--light.v-tabs-items > div > div > form > div.row.no-gutters > div.py-0.d-flex.flex-column.col.col-12 > div > div.v-input.v-input--md.v-input--has-state.v-input--dense.theme--light.v-text-field.v-text-field--is-booted.v-text-field--enclosed.v-text-field--outlined.v-text-field--placeholder.error--text > div > div.v-text-field__details > div > div > div',

            // Import Instance
            '@import-existing-wordpress-instance-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-8.pt-8 > div.selection-box > div:nth-child(2)',
            '@import-existing-wordpress-current-wordpress-url' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-8.pt-8 > div.form-box > div > div > div > div.v-input__slot > div > input',
            '@import-existing-wordpress-instance-hostname/ip' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-8.pt-8 > form > div:nth-child(1) > div > div > div > div > input',
            '@import-existing-wordpress-protocol' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-8.pt-8 > form > div:nth-child(2) > div > div > div > div.v-select__slot > div.v-select__selections > div',
            '@import-existing-wordpress-server-port' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-8.pt-8 > form > div:nth-child(3) > div > div > div > div > input',
            '@import-existing-wordpress-ftp-user' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-8.pt-8 > form > div:nth-child(4) > div > div > div > div > input',
            '@import-existing-wordpress-ftp-password' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-8.pt-8 > form > div:nth-child(5) > div > div > div > div > input',
            '@import-existing-wordpress-installed-path' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-8.pt-8 > form > div:nth-child(6) > div > div > div > div > input',
            '@import-existing-wordpress-error-box' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__text.px-8.pt-8 > div.error-box.mt-5 > span:nth-child(2)',
            '@import-existing-wordpress-continue-btn' => '#app > div.v-dialog__content.v-dialog__content--active > div > div.v-card.v-sheet.theme--light > div.v-card__actions.pt-8.d-flex.align-center.justify-space-between > div.d-flex.align-center > button.v-btn.v-btn--has-bg.theme--light.elevation-0.v-size--large.primary > span',
            ];
    }

    /**
     * @param Browser $browser
     * @param int $userId
     * @param int $planId
     * @return void
     */
    public function createService(Browser $browser, int $userId, int $planId): void
    {
        // Legacy: the old `Helper::setTestService()` wrote a `services` row. v1
        // has no such table; the ported instance tests are skipped and this
        // step is kept only to show the old flow.
    }

    /**
     * @param Browser $browser
     * @param Plan $plan
     * @param array $data
     * @return void
     */
    public function createInstance(Browser $browser, object $plan, array $data): void
    {
        $faker = \Faker\Factory::create();
        $config = $plan->config;
        // Legacy: the old `Service::count()` read the `services` table. v1 has
        // one virtual service; the ported instance tests are skipped.
        $services = 1;

        // Standard Onboarding
        if ($config['onboarding']['method'] == 'standard') {
            $browser->refreshPage()
                ->press('@add-new-instance-btn')
                ->click('@create-new-wordpress-instance')
                ->press('@continue-btn');

            if ($config['onboarding']['standard_ask_for_theme']) {
                $browser->click('@use-this-theme');
            }

            if ($services >= 2) {
                $browser->click('@multiple-services')
                    ->waitFor('@choose-product')
                    ->click('@choose-product')
                    ->press('@set-website-name-btn');
            }

            $browser->type('@new-installation-site-name', $data['site_name'])
                ->type('@new-installation-domain', $data['domain'])
                ->click('@new-clean-installation');

            if ($config['onboarding']['standard_fields']['admin_username']) {
                $browser->click('@advanced-configuration-tab')
                    ->clearElement('@administrator-username')
                    ->type('@administrator-username', Str::random(10));
            }

            if ($config['onboarding']['standard_fields']['admin_email']) {
                $browser->clearElement('@administrator-email')
                    ->type('@administrator-email', $faker->email());
            }

            if ($config['onboarding']['standard_fields']['admin_password']) {
                $browser->clearElement('@administrator-password')
                    ->type('@administrator-password', $faker->password());
            }

            if ($data['site_name'] == null || $data['domain'] == null){
                $browser->errorValidation('@new-installation-site-name-required', 'The website name is required')
                    ->errorValidation('@new-installation-domain-required', 'The domain is required');
            } else {
                $browser->press('@standard-onboarding-continue-btn')
                    ->checkNotifications('success', 90);
            }
        }

        // Quick Onboarding
        if ($config['onboarding']['method'] == 'quick') {
            $browser->refreshPage()
                ->waitAndPress('@add-new-instance-btn')
                ->waitAndClick('@create-new-wordpress-instance')
                ->waitAndPress('@continue-btn')
                ->click('@use-this-theme', 15)
                ->waitAndType('@set-website-name', $data['site_name'])
                ->waitAndPress('@create-site');

            if ($data['site_name'] == null) {
                $browser->waitFor('@set-website-name-error');
            } else {
                $browser->waitFor('@manage-your-site-btn', 90);
            }

        }
    }

    /**
     * @param Browser $browser
     * @param array|null $params
     * @return void
     */
    public function importInstance(Browser $browser, ?array $params): void
    {
        $browser->refreshPage()
            ->press('@add-new-instance-btn')
            ->click('@import-existing-wordpress-instance')
            ->press('@continue-btn')
            ->waitFor('@import-existing-wordpress-current-wordpress-url')
            ->type('@import-existing-wordpress-current-wordpress-url', $params['url']);
        if ($params['url'] == 'https://example.com'){
            $browser->waitFor('@import-existing-wordpress-error-box');
        } else {
            $browser->waitFor('@import-existing-wordpress-continue-btn')
                ->press('@import-existing-wordpress-continue-btn')
                ->waitFor('@import-existing-wordpress-instance-hostname/ip')
                ->type('@import-existing-wordpress-instance-hostname/ip', $params['hostname'])
                ->type('@import-existing-wordpress-ftp-user', $params['user'])
                ->type('@import-existing-wordpress-ftp-password', $params['password'])
                ->type('@import-existing-wordpress-installed-path', $params['path'])
                ->press('@continue-btn');

            if ($params['url'] == null || $params['hostname'] == null || $params['user'] == null || $params['password'] == null || $params['path'] == null) {
                $browser->waitForTextIn('@import-existing-wordpress-error-box', 'Please fill all the fields');
            }
        }
    }
}
