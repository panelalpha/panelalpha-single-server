<?php

namespace PanelAlpha\Hub\Console;

use Illuminate\Console\Command;
use PanelAlpha\Hub\HubDisconnection;

final class HubDisconnectCommand extends Command
{
    protected $signature = 'hub:disconnect';

    protected $description = 'Disconnect this panel from PanelAlpha Hub';

    public function handle(HubDisconnection $disconnection): int
    {
        $this->line($disconnection->run() ? 'Disconnected from PanelAlpha.' : 'Not connected to PanelAlpha.');

        return self::SUCCESS;
    }
}
