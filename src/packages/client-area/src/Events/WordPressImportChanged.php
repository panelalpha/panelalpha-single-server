<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Foundation\Events\Dispatchable;

/**
 * A WordPress import's record changed (Engine 2.2.0): it was started,
 * moved on, ended or was retried. Fired by {@see \PanelAlpha\ClientArea\Models\WordPressImport}
 * on every save, so a paid edition can mirror it (the Admin Area's Migrations
 * page, its badge and the admin import notifications); Community has no listener.
 */
final class WordPressImportChanged
{
    use Dispatchable;

    public function __construct(public readonly int $applicationId) {}
}
