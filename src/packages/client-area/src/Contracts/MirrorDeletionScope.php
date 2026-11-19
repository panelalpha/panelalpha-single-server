<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Database\Eloquent\Builder;
use PanelAlpha\ClientArea\Models\Application;

/**
 * One constraint on the sync's
 * "delete the rows the Engine no longer lists" query. A scope keeps a row the
 * Engine dropped (e.g. between the delete and re-create of the classic
 * onboarding replace) so the CA's id survives. The controller tags
 * its `ReplacingMarkerDeletionScope` under {@see self::TAG} (it
 * moved from client-area-legacy, which tagged it); an edition may tag more.
 */
interface MirrorDeletionScope
{
    /**
     * The container tag the sync resolves every scope from.
     */
    public const string TAG = 'mirror-deletion-scopes';

    /**
     * @param  Builder<Application>  $query
     */
    public function apply(Builder $query): void;
}
