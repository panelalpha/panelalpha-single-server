<?php

namespace PanelAlpha\Community\Setup;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Contracts\Auth\Guard;
use Illuminate\Contracts\Auth\StatefulGuard;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use LogicException;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\ClientArea\Contracts\SetupState;
use Throwable;

/**
 * The first-run sequence every setup path shares (the local form, Connect and
 * the installer's Hub code): lock, recheck, one transaction with the user, the
 * server name and any extra work, then the login. The user is signed in only
 * after the commit, and not at all on the unattended path.
 */
class FirstRunSetup
{
    private const string LOCK = 'community:first-user';

    public function __construct(
        private readonly Request $request,
        private readonly SetupState $state,
        private readonly PanelSettings $settings,
        private readonly AuthFactory $auth,
    ) {}

    /**
     * @param  callable(): Authenticatable  $createUser
     * @param  (callable(Authenticatable): mixed)|null  $alsoInTransaction  runs in the same transaction; a throw rolls everything back
     *
     * @throws SetupAlreadyDone when a user exists already or the lock cannot be taken
     * @throws Throwable whatever $alsoInTransaction throws, after the rollback
     */
    public function run(callable $createUser, string $serverName, ?callable $alsoInTransaction = null): Authenticatable
    {
        // Before the lock: no user may be created that the browser cannot be
        // logged in as.
        if (! $this->request->hasSession()) {
            throw new LogicException('The setup needs a browser session.');
        }
        /** @var Guard $guard The factory's return type is narrower than any guard a host may configure. */
        $guard = $this->auth->guard();
        if (! $guard instanceof StatefulGuard) {
            throw new LogicException('The setup wizard needs a stateful (session) auth guard.');
        }

        return $this->locked($createUser, $serverName, $alsoInTransaction, function (Authenticatable $user) use ($guard): void {
            $guard->login($user);
            $this->request->session()->regenerate();
        });
    }

    /**
     * The same sequence with nobody to sign in: the boot-time Hub install code
     * (`hub:claim-install-code`), which runs before any browser has the panel.
     *
     * @param  callable(): Authenticatable  $createUser
     * @param  (callable(Authenticatable): mixed)|null  $alsoInTransaction
     *
     * @throws SetupAlreadyDone when a user exists already or the lock cannot be taken
     * @throws Throwable whatever $alsoInTransaction throws, after the rollback
     */
    public function runUnattended(callable $createUser, string $serverName, ?callable $alsoInTransaction = null): Authenticatable
    {
        return $this->locked($createUser, $serverName, $alsoInTransaction, null);
    }

    /**
     * Lock, recheck, one transaction; $afterCommit runs while the lock is still held.
     *
     * @param  callable(): Authenticatable  $createUser
     * @param  (callable(Authenticatable): mixed)|null  $alsoInTransaction
     * @param  (callable(Authenticatable): void)|null  $afterCommit
     */
    private function locked(callable $createUser, string $serverName, ?callable $alsoInTransaction, ?callable $afterCommit): Authenticatable
    {
        $lock = Cache::lock(self::LOCK, 30);
        try {
            $lock->block(5);
        } catch (LockTimeoutException) {
            throw new SetupAlreadyDone;
        }

        try {
            if (! $this->state->required()) {
                throw new SetupAlreadyDone;
            }

            $user = DB::transaction(function () use ($createUser, $serverName, $alsoInTransaction): Authenticatable {
                $user = $createUser();
                $this->settings->set('userapp.name', $serverName);
                if ($alsoInTransaction !== null) {
                    $alsoInTransaction($user);
                }

                return $user;
            });

            if ($afterCommit !== null) {
                $afterCommit($user);
            }
        } finally {
            $lock->release();
        }

        return $user;
    }
}
