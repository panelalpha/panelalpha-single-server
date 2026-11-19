<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Question 1 of the edition contracts: "which applications can this user see?"
 *
 * The only place where application visibility is decided. Controllers never
 * query Application directly; route binding for {application} goes through
 * findForUser(), so an id the user cannot see is a 404 everywhere.
 *
 * Community: every application (one owner). Pro/Multi: applications linked to the user.
 */
interface ApplicationRepository
{
    /**
     * Applications visible to the user, live and staging alike.
     *
     * `$refresh` lets a caller that must never block on the Engine (`/home`,
     * `/login`) read the local mirror only; the scheduler
     * keeps it fresh. When false, implementations return what the mirror holds.
     *
     * Pro/Multi semantics: every edition honours `$refresh` the same way – it
     * controls only the Engine refresh, never ownership. A Pro/Multi
     * implementation still filters to the user's linked applications on both
     * paths, and dispatches the sync job (not an inline sync) when the Engine
     * was never synced.
     *
     * @return Collection<int, Application>
     */
    public function forUser(Authenticatable $user, bool $refresh = true): Collection;

    /**
     * @throws ModelNotFoundException when the application does not exist or the user cannot see it
     */
    public function findForUser(Authenticatable $user, int $id): Application;

    /**
     * Every domain the panel has mirrored, for **every** user: the global
     * integrity check behind the onboarding "domain taken" answer, which must
     * not be scoped to the asking user or another user could claim the domain
     *Community has one user, so this is the whole
     * mirror. This is not a visibility read – it may not filter by user and it
     * never calls the Engine.
     *
     * @return list<string>
     */
    public function domainsInUse(): array;
}
