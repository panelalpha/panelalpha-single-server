<?php

namespace PanelAlpha\Community\Setup;

use Illuminate\Contracts\Container\Container;
use Illuminate\Database\Eloquent\Model;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Contracts\SetupState;

/**
 * Setup is required while single-user mode is active and the auth users model
 * has no rows. The entrypoint writes a marker when the delivered first-user
 * variables could not create that account; the marker keeps the wizard closed
 * (no visitor may take a panel whose account the operator meant to set) and
 * `blocked()` lets the login page say what to fix. The marker is only read
 * while still no user exists, so a stale one cannot outlive the account.
 */
final class UsersTableSetupState implements SetupState
{
    public function __construct(private readonly Container $container) {}

    public function required(): bool
    {
        return SingleUserMode::active($this->container)
            && ! $this->blocked()
            && ! $this->hasUser();
    }

    public function blocked(): bool
    {
        if (! SingleUserMode::active($this->container) || ! $this->creationFailed()) {
            return false;
        }

        return ! $this->hasUser();
    }

    /**
     * The file the entrypoint writes when `users:create` refused the variables.
     */
    private function creationFailed(): bool
    {
        $path = $this->container->make('config')->get('community.first_user_failed_marker');

        return is_string($path) && $path !== '' && is_file($path);
    }

    private function hasUser(): bool
    {
        /** @var class-string<Model> $model */
        $model = $this->container->make('config')->get('auth.providers.users.model');

        return $model::query()->exists();
    }
}
