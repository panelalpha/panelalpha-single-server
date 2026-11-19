<?php

namespace Tests\Browser\ClientArea\Pages\Hosting\Emails;

use Laravel\Dusk\Browser;

class EmailForwardersPage
{
    /**
     * @return string
     */
    public function url(): string
    {
        return '/hosting/email-forwarders';
    }

    /**
     * @param Browser $browser
     * @return void
     */
    public function assert(Browser $browser)
    {
        $browser->assertPathIs($this->url());
    }

    /**
     * @return string[]
     */
    public function elements(): array
    {
        return [
            '@element' => '#selector',
        ];
    }
}
