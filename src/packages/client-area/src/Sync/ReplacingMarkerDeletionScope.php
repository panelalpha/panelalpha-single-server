<?php

namespace PanelAlpha\ClientArea\Sync;

use Illuminate\Database\Eloquent\Builder;
use PanelAlpha\ClientArea\Contracts\MirrorDeletionScope;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Jobs\Application\ReplaceClassicOnboardingProjectJob;

/**
 * A `MirrorDeletionScope` seam: the `replacing_at` delete
 * clause extracted verbatim from `ApplicationSynchronizer::sync()` and moved to
 * `client-area-legacy`; the controller's provider tags it now.
 *
 * A row the classic-onboarding replace job is swapping is absent from the
 * Engine between its delete and create; keep it so the CA's id survives
 *A stale marker (lost job) is ignored and the row
 * is reconciled normally.
 *
 * Permanent panel code: the Engine attaches a source to a
 * container project only, and the classic replacement
 * the CA's domain step needs with several services is panel code (re-check
 * 2026-10-15), so this moved from client-area-legacy into
 * the controller.
 */
final class ReplacingMarkerDeletionScope implements MirrorDeletionScope
{
    /**
     * @param  Builder<Application>  $query
     */
    public function apply(Builder $query): void
    {
        $query->where(function (Builder $query): void {
            $query->whereNull('replacing_at')
                ->orWhere('replacing_at', '<=', now()->subSeconds(ReplaceClassicOnboardingProjectJob::STALE_AFTER_SECONDS));
        });
    }
}
