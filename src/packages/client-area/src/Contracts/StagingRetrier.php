<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Re-run the copy for a failed
 * staging. The Engine has no restage call, so the panel deletes the failed
 * project and creates it again under the same username and domain. The
 * controller binds `DeleteAndRecreateStagingRetrier` as the
 * default (`bindIf`; it moved from client-area-legacy, and the
 * refusing `NullStagingRetrier` was deleted), so an edition may still replace
 * it.
 */
interface StagingRetrier
{
    /**
     * @param  array<string, mixed>  $params
     *
     * @throws ValidationException
     */
    public function retry(Application $parent, Application $staging, array $params): Application;
}
