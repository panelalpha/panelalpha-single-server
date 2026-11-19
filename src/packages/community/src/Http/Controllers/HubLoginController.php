<?php

namespace PanelAlpha\Community\Http\Controllers;

use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Contracts\Auth\Guard;
use Illuminate\Contracts\Auth\StatefulGuard;
use Illuminate\Contracts\Container\Container;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Contracts\HubLogin;
use PanelAlpha\Hub\HubLoginTicket;
use PanelAlpha\Hub\HubPairing;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * "Sign in with PanelAlpha" for the Community panel (PANEL-LOGIN-CONTRACT.md 2.1-2.3;
 * old `HubLoginController`, packages/api/app/Http/Controllers/HubLoginController.php;
 * Kept for Free and Pro, not Multi). The CA's login page calls
 * `GET /api/hub-login/start` (`Auth.js:235-240`) and goes to the returned Hub
 * URL; the Hub sends the browser to `<admin_url>/hub-login#ticket=…` and the
 * CA posts it to `POST /api/hub-login` (`Auth.js:223-231`, `HubLogin.vue`).
 *
 * A valid ticket signs in the panel's only user. The Hub already applied its
 * own sign-in and 2FA policy, so the panel's 2FA is skipped (contract P7, as
 * the old panel did). Every failure gets the same 422; tickets are never
 * logged. A ticket for "Open in panel" on one app names it (`target.app`,
 * contract §8): the answer's `redirect` is that project's page.
 */
final class HubLoginController extends Controller
{
    public const string STATE_SESSION_KEY = 'community.hub_login_state';

    /** How long a panel-started login keeps its state (contract 2.1: 10 minutes). */
    public const int STATE_SECONDS = 600;

    public const string NOT_AVAILABLE = 'Sign in with PanelAlpha is not available.';

    public const string INVALID = 'This login link is not valid any more. Log in again from PanelAlpha.';

    public function __construct(
        private readonly HubLogin $hubLogin,
        private readonly HubPairing $pairing,
        private readonly HubLoginTicket $tickets,
        private readonly Container $container,
        private readonly ApplicationRepository $applications,
    ) {}

    /**
     * GET /api/hub-login/start: keep a state in this visitor's session and
     * answer the Hub URL (old `start()`).
     */
    public function start(Request $request): JsonResponse
    {
        if (! $this->hubLogin->available() || ! $request->hasSession()) {
            return new JsonResponse(['message' => self::NOT_AVAILABLE], 404);
        }

        $state = Str::random(32);
        $request->session()->put(self::STATE_SESSION_KEY, ['state' => $state, 'expires_at' => time() + self::STATE_SECONDS]);

        $query = ['panel' => (string) $this->pairing->serverId(), 'state' => $state];
        if ($request->query('provider') === 'google') {
            $query['provider'] = 'google';
        }

        return new JsonResponse(['url' => $this->pairing->hubUrl().'/panel-login?'.http_build_query($query)]);
    }

    /**
     * POST /api/hub-login {ticket}: sign in the panel's only user (old `login()`).
     */
    public function login(Request $request, AuthFactory $auth): JsonResponse
    {
        /** @var mixed $stored */
        $stored = $request->hasSession() ? $request->session()->pull(self::STATE_SESSION_KEY) : null;
        $sessionState = is_array($stored) && (Payload::int($stored['expires_at'] ?? null) ?? 0) >= time()
            ? Payload::nullableString($stored['state'] ?? null)
            : null;

        $available = $this->hubLogin->available();
        $ticket = Payload::nullableString($request->input('ticket'));
        $claims = $available && $ticket !== null ? $this->tickets->verify($ticket, $sessionState) : null;
        $user = $claims !== null ? $this->onlyUser() : null;
        /** @var Guard $guard The factory's return type is narrower than any guard a host may configure. */
        $guard = $auth->guard();
        if ($claims === null || $user === null || ! $guard instanceof StatefulGuard) {
            Log::info('Login from PanelAlpha refused', [
                'reason' => ! $available ? 'not_available' : ($this->tickets->lastFailure ?? ($claims !== null ? 'no_user' : 'no_ticket')),
                'session_has_state' => $sessionState !== null,
            ]);

            return new JsonResponse(['message' => self::INVALID], 422);
        }

        // No 2FA challenge: the Hub's sign-in is the check (contract P7).
        $guard->login($user);
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        // The activity log shows "Logged In From PanelAlpha" with the Hub user the
        // ticket names (old payload `PanelAlpha => {email, name}`).
        $request->attributes->set('activity', ['PanelAlpha' => [
            'email' => Payload::string($claims['email'] ?? ''),
            'name' => Payload::string($claims['name'] ?? ''),
        ]]);

        $redirect = $this->target($claims, $user);

        return new JsonResponse(['success' => true] + ($redirect !== null ? ['redirect' => $redirect] : []));
    }

    /**
     * The page of the app a ticket's `target.app` names (the `id` the report
     * gives it), looked up in the panel's own mirror without an Engine call.
     * Only the id found there makes the path, never the claim's text; an
     * unknown id, or an app the user cannot see, is no target (the dashboard).
     *
     * @param  array<string, mixed>  $claims
     */
    private function target(array $claims, \Illuminate\Contracts\Auth\Authenticatable $user): ?string
    {
        $appId = Payload::nullableString(Payload::object($claims['target'] ?? null)['app'] ?? null);
        if ($appId === null || preg_match('/^[1-9][0-9]{0,17}$/', $appId) !== 1) {
            return null;
        }

        $app = $this->applications->forUser($user, false)->find((int) $appId);

        return $app !== null ? '/projects/'.$app->id : null;
    }

    /**
     * The Community panel's one user (single-user mode; the old single-server
     * default user).
     */
    private function onlyUser(): ?\Illuminate\Contracts\Auth\Authenticatable
    {
        /** @var class-string<Model> $model */
        $model = $this->container->make('config')->get('auth.providers.users.model');
        $user = $model::query()->orderBy($model::query()->getModel()->getKeyName())->first();

        return $user instanceof \Illuminate\Contracts\Auth\Authenticatable ? $user : null;
    }
}
