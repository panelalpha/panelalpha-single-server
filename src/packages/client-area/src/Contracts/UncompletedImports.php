<?php

namespace PanelAlpha\ClientArea\Contracts;

/**
 * Whether the panel still has an uncompleted migration, for the Client Area's
 * `/home` (`app.single_server.has_uncompleted_imports`): the Admin Area
 * dropdown shows its badge while an import is in progress or failed (old
 * `Import::hasUncompleted()`, packages/api/app/Models/Import.php:73-81).
 *
 * Community has no imports: the controller's default answers false; the paid
 * Admin Area binds its own, reading the `imports` table it owns.
 */
interface UncompletedImports
{
    public function exists(): bool;
}
