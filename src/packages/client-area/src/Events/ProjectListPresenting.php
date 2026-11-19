<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Collection;
use PanelAlpha\ClientArea\Models\Application;

/**
 * The controller is about to present a list of projects to a user:
 * `ProjectPresenter::presentList()` fires it before the first
 * project and {@see ProjectListPresented} after the last, so an edition can
 * look up what its contract answers need for the whole list at once instead
 * of per project. Community listens to neither. Dispatched synchronously.
 */
final class ProjectListPresenting
{
    /**
     * @param  Collection<int, Application>  $applications  the listed projects and their stagings
     */
    public function __construct(
        public readonly Collection $applications,
        public readonly Authenticatable $user,
    ) {}
}
