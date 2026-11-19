<?php

namespace PanelAlpha\ClientArea\Access;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Collection;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\PanelUser;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Community is strictly single-user: the user owns everything and
 * gets every privilege except the multi-user ones, so the Client Area hides
 * shared access and invitations.
 */
final class SingleUserAccessResolver implements AccessResolver
{
    /** @var list<string>|null */
    private ?array $privileges = null;

    public function privileges(Authenticatable $user, Application $application): array
    {
        return $this->privileges ??= array_values(array_diff(Privileges::ALL, Privileges::MULTI_USER));
    }

    public function allows(Authenticatable $user, Application $application, string $privilege): bool
    {
        return in_array($privilege, $this->privileges($user, $application), true);
    }

    public function allowsUser(Authenticatable $user, string $privilege): bool
    {
        return in_array($privilege, $this->privileges($user, new Application()), true);
    }

    /**
     * Every user row is notified. Community expects exactly one, but the
     * `users:create` CLI does not prevent adding more.
     */
    public function usersFor(Application $application): Collection
    {
        /** @var class-string<\Illuminate\Database\Eloquent\Model&Authenticatable> $model */
        $model = config('auth.providers.users.model');

        /** @var list<PanelUser> $users */
        $users = $model::query()->get()->all();

        return new Collection($users);
    }
}
