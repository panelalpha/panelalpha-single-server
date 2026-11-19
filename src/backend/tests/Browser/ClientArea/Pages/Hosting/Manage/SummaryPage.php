<?php

namespace Tests\Browser\ClientArea\Pages\Hosting\Manage;

use Illuminate\Database\Eloquent\Collection;
use Laravel\Dusk\Browser;
use Tests\Browser\ClientArea\Pages\Page;

class SummaryPage extends Page
{
    /**
     * @return string
     */
    public function url(): string
    {
        return '/hosting/summary';
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function assert(Browser $browser)
    {
        $browser->assertPathIs($this->url())
                ->waitFor('@logo');
    }

    /**
     * @return string[]
     */
    public function elements(): array
    {
        return [
            //General
            '@header-hosting' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(1) > div > div > div > h1',
            '@switcher' => '#app > div > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.sticky-sidebar.col-lg-2.col-12 > div > div:nth-child(1)',
            '@switcher-second-plan' => '#app > div.v-menu__content.theme--light.menuable__content__active.custom-dropdown-select.custom-dropdown-select--plans > div > div:nth-child(2)',
            '@summary-tab-without-switcher' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.sticky-sidebar.col-lg-2.col-12 > div > div:nth-child(2) > a.elevation-4--before.v-list-item--active.v-list-item.v-list-item--link.theme--light',
            '@summary-tab-with-switcher' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.sticky-sidebar.col-lg-2.col-12 > div > div:nth-child(3) > a.elevation-4--before.v-list-item--active.v-list-item.v-list-item--link.theme--light',
            '@summary' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div:nth-child(1) > div > div > h4',
            // Main Domain & Nameservers
            '@info' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(1) > div:nth-child(1)',
            '@main-domain' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(1) > div:nth-child(1) > div.v-card__title.pb-6.d-flex.flex-row.justify-space-between > h6',
            '@nameservers' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(1) > div:nth-child(1) > div.v-card__text > ul',
            '@nameservers-info' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(1) > div:nth-child(1) > div.v-card__text > p',
            '@nameservers-error' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(1) > div:nth-child(1) > div.v-card__text > h6 > button',
            // Plan Usage
            '@plan-usage-form' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(2)',
            '@plan-usage-header' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(2) > div > div.v-card__title.pb-6.d-flex.flex-row.justify-space-between > h6',
            '@upgrade' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(2) > div > div.v-card__title.pb-6.d-flex.flex-row.justify-space-between > a',
            '@disk-space' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(2) > div > div.v-card__text.d-flex.align-center.justify-space-between.space-indicator-row > div:nth-child(1)',
            '@email-accounts' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(2) > div > div.v-card__text.d-flex.align-center.justify-space-between.space-indicator-row > div:nth-child(2)',
            '@bandwidth' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(2) > div > div:nth-child(4) > div > div:nth-child(1) > div',
            '@ftp-accounts' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(2) > div > div:nth-child(4) > div > div:nth-child(2) > div',
            '@mysql-databases' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(2) > div > div:nth-child(4) > div > div:nth-child(3)',
            '@sub-domains' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(2) > div > div:nth-child(4) > div > div:nth-child(4)',
            '@email-accounts2' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(2) > div > div:nth-child(4) > div > div:nth-child(5)',
            '@addon-domains' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(2) > div > div:nth-child(4) > div > div:nth-child(6)',
            //Hosting Instances
            '@hosting-instances' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(1) > div:nth-child(2)',
            '@hosting-instances-number' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(1) > div:nth-child(2) > div.v-card__title.pb-6 > h6',
            '@instances' => '#app > div.v-application--wrap > main > div > div:nth-child(2) > div:nth-child(3) > div > div > div.col-lg-10.col-12.pl-12 > div > div.container.mt-3.px-0 > div > div:nth-child(1) > div:nth-child(2) > div.v-card__text.d-flex.flex-column.pt-2.px-0',
            '@backups' => '#app > div.v-menu__content.theme--light.menuable__content__active.elevation-4--before.elevation-4--after.elevation-4 > div > div:nth-child(1) > span > span',
        ];
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function switchToSecondPlan(Browser $browser): void
    {
        $browser->click('@switcher')
            ->waitFor('@switcher-second-plan')
            ->click('@switcher-second-plan');
    }

    /**
     * @param Browser $browser
     * @param string $instance_domain
     * @return void
     */
    public function nameservers(Browser $browser, string $instance_domain): void
    {
        $browser->waitFor('@info')
            ->waitForTextIn('@main-domain', $instance_domain, 30)
            ->waitForTextIn('@nameservers-info', 'Point your domain name to the following nameservers to link with our nameservers')
            ->waitFor('@nameservers');
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function planUsage(Browser $browser): void
    {
        $browser->waitFor('@plan-usage-form')
            ->waitForTextIn('@plan-usage-header', 'Plan Usage', 15)
            ->waitForTextIn('@disk-space', 'Available:')
            ->waitForTextIn('@email-accounts', 'Available:')
            ->waitFor('@bandwidth')
            ->waitFor('@ftp-accounts')
            ->waitFor('@mysql-databases')
            ->waitFor('@sub-domains')
            ->waitFor('@email-accounts2')
            ->waitFor('@addon-domains');
    }

    /**
     * @param Browser $browser
     * @param string $instance_name
     * @return void
     */
    public function hostingInstances(Browser $browser, string $instance_name): void
    {
        $browser->waitFor('@hosting-instances')
            ->waitForTextIn('@instances', $instance_name, 15);
    }

    /**
     * @param Browser $browser
     * @param string $url
     * @return void
     */
    public function upgrade(Browser $browser, string $url): void
    {
        $browser->waitFor('@upgrade')
            ->click('@upgrade')
            ->pause(100);
        $window = collect($browser->driver->getWindowHandles())->last();
        $browser->driver->switchTo()->window($window);
        $browser->assertUrlIs($url);
    }
}
