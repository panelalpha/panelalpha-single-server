<?php

namespace PanelAlpha\Community\Http\Controllers;

use Closure;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Container\Container;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Contracts\FirstUserCreator;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Contracts\SetupState;
use PanelAlpha\Hub\HubClient;
use PanelAlpha\Hub\HubConnectedUser;
use PanelAlpha\Hub\HubDisconnection;
use PanelAlpha\Hub\HubPairing;
use PanelAlpha\Community\Hub\HubActivation;
use PanelAlpha\Community\Hub\PairingRejected;
use PanelAlpha\Community\Hub\Sleeper;
use PanelAlpha\Community\Http\Requests\SetupRequest;
use PanelAlpha\Community\Setup\FirstRunSetup;
use PanelAlpha\Community\Setup\SetupAlreadyDone;
use PanelAlpha\EngineClient\Support\Payload;
use Throwable;

/**
 * Connect the panel to PanelAlpha Hub from the setup wizard or Settings, and
 * disconnect it from Settings.
 *
 * The wizard creates a connect request and keeps device_code + a random state
 * (and, while the setup is required, the server name) in the visitor's own
 * session: a guest during the setup, the signed-in user otherwise. The Hub
 * sends the browser back to /hub-connected with that state; only a matching
 * return activates the pairing. While the setup is required, the approval also
 * creates the admin from the Hub user who approved (`user`, contract 1.4),
 * saves the server name, stores the pairing and sends the first report in one
 * transaction, then signs the admin in. Once the setup is done, `user` only
 * names who connected the panel: Community holds one user and never adds a second.
 * Either way the pairing keeps that Hub user's id, the only `sub` a login
 * ticket may then name, so an approval without a `user` pairs nothing.
 * device_code is never sent to the browser or logged, and of `user` only the
 * id is stored apart from the user row.
 */
class HubConnectController extends Controller
{
    private const string SESSION_KEY = 'community.hub_connect';

    private const int RETURN_POLL_SECONDS = 10;

    public function __construct(
        private readonly HubClient $hub,
        private readonly HubPairing $pairing,
        private readonly Container $container,
        private readonly Sleeper $sleeper,
        private readonly SetupState $setupState,
        private readonly FirstRunSetup $setup,
        private readonly FirstUserCreator $users,
        private readonly HubActivation $activation,
    ) {}

    public function status(): JsonResponse
    {
        $this->singleUserOnly();

        return new JsonResponse($this->pairing->summary());
    }

    public function start(Request $request): JsonResponse
    {
        $this->singleUserOnly();
        if (! $request->hasSession()) {
            return $this->error('Connecting needs a signed-in browser session. Reload the page and try again.', 409);
        }
        $setupRequired = $this->setupState->required();
        $request->validate(['admin_url' => ['nullable', 'string', 'max:2048']]
            + ($setupRequired ? ['server_name' => (new SetupRequest)->rules()['server_name']] : []));
        // A new request replaces a pending one: close it on the Hub, or an approval there is left behind.
        $previous = $this->getPending($request);
        $this->forgetPending($request);
        if ($previous !== null && $previous['device_code'] !== '') {
            $this->cancelOnHub($previous['device_code']);
        }

        // The Hub returns the browser to admin_url, so use the address the user is on.
        // A guest is unauthenticated and could send the approver's browser to a foreign
        // origin: for them it is always the panel's own address.
        $adminUrl = $request->user() === null ? '' : HubClient::origin($request->string('admin_url')->toString());
        if (! preg_match('#^https?://#', $adminUrl)) {
            $adminUrl = HubClient::origin($this->container->make(PanelUrl::class)->base());
        }

        try {
            $response = $this->hub->createConnectRequest($adminUrl);
        } catch (Throwable $e) {
            // The class only: a transport message may carry the request URL.
            Log::warning('PanelAlpha Hub connect request failed', ['exception' => $e::class]);

            return $this->error('PanelAlpha could not be reached. Try again.', 502);
        }

        if ($response->status() === 429) {
            return $this->error('Too many attempts. Try again in a minute.', 429);
        }
        if ($response->status() !== 201) {
            $message = Payload::string($response->json('message'));

            return $this->error(match (true) {
                $response->json('error') === 'invalid_address' => 'PanelAlpha needs a public IP address and an https:// URL for this panel.',
                $message !== '' => $message,
                default => 'PanelAlpha refused the request.',
            }, 422);
        }

        $expiresIn = min(max(Payload::int($response->json('expires_in')) ?? 900, 60), 1800);
        $deviceCode = Payload::string($response->json('device_code'));
        $link = Payload::string($response->json('link'));
        if (! HubClient::isHubUrl($link)) {
            // Nothing is kept for a request the browser cannot follow, so close it on the Hub.
            if ($deviceCode !== '') {
                $this->cancelOnHub($deviceCode);
            }

            return $this->error('PanelAlpha sent an unexpected address. Try again.', 502);
        }

        $state = Str::random(32);
        $request->session()->put(self::SESSION_KEY, Crypt::encryptString(json_encode([
            'device_code' => $deviceCode,
            'state' => $state,
            'admin_url' => $adminUrl,
            'server_name' => $setupRequired ? $request->string('server_name')->toString() : null,
            'expires_at' => now()->getTimestamp() + $expiresIn,
        ], JSON_THROW_ON_ERROR)));

        $link .=(str_contains($link, '?') ? '&' : '?').'state='.$state;

        return new JsonResponse([
            'user_code' => Payload::string($response->json('user_code')),
            'link' => $link,
            'expires_in' => $expiresIn,
        ]);
    }

    /**
     * The browser came back from the Hub: /hub-connected?state=...&result=approved|denied
     */
    public function complete(Request $request): JsonResponse
    {
        $this->singleUserOnly();

        $request->validate([
            'state' => ['required', 'string', 'max:128'],
            'result' => ['nullable', 'string', 'max:32'],
        ]);
        $pending = $this->getPending($request);
        $state = $request->string('state')->toString();

        if (! $pending || ! hash_equals($pending['state'], $state)) {
            return $this->error('This connection was not started here.', 422);
        }
        if ($pending['expires_at'] < now()->getTimestamp()) {
            $this->forgetPending($request);

            return $this->result('expired', 'The link expired. Start again.');
        }
        if ($request->string('result')->toString() !== 'approved') {
            $this->forgetPending($request);
            $this->cancelOnHub($pending['device_code']);

            return $this->result('denied', 'Not connected. The request was denied on PanelAlpha.');
        }

        // One poll loop per session: a second tab or a double click must not poll in parallel.
        $lock = Cache::lock('community:hub-complete:'.sha1($request->session()->getId()), self::RETURN_POLL_SECONDS + 20);
        if (! $lock->get()) {
            // `code` tells this 409 from "the setup is already done": the wizard keeps the state and waits.
            return new JsonResponse(['message' => 'The connection is already being confirmed. Wait a moment.', 'code' => 'confirming'], 409);
        }

        try {
            return $this->poll($request, $pending);
        } finally {
            $lock->release();
        }
    }

    /**
     * The pending record is kept until the Hub gives a final answer, so a Hub
     * hiccup or a timeout can be retried with the same state.
     *
     * @param  array{device_code: string, state: string, admin_url: ?string, server_name: ?string, expires_at: int}  $pending
     */
    private function poll(Request $request, array $pending): JsonResponse
    {
        $deadline = microtime(true) + (float) self::RETURN_POLL_SECONDS;
        do {
            try {
                // A poll never runs past the deadline by more than the 1 s floor.
                $response = $this->hub->pollConnectRequest($pending['device_code'], $deadline - microtime(true));
            } catch (Throwable $e) {
                Log::warning('PanelAlpha Hub poll failed', ['exception' => $e::class]);
                $response = null;
            }

            if ($response && $response->status() === 200) {
                $this->forgetPending($request);

                return $this->activate($request, Payload::object($response->json()), $pending);
            }

            $error = $response === null ? '' : Payload::string($response->json('error'));
            if ($error === 'access_denied') {
                $this->forgetPending($request);

                return $this->result('denied', 'Not connected. The request was denied on PanelAlpha.');
            }
            // A definite 4xx answer from the Hub (expired_token, unknown code) is final;
            // pending, slow_down, 429, 5xx and transport errors are retried until the deadline.
            if ($response && $this->isFinalError($response->status(), $error)) {
                $this->forgetPending($request);

                return $this->result('expired', 'The link expired. Start again.');
            }

            $remaining = $deadline - microtime(true);
            if ($remaining <= 0) {
                break;
            }
            $this->sleeper->sleep(min($error === 'slow_down' ? 3.0 : 1.0, $remaining));
        } while (microtime(true) < $deadline);

        return $this->result('pending', 'PanelAlpha has not confirmed the connection yet. Try again.');
    }

    private function isFinalError(int $status, string $error): bool
    {
        if (in_array($error, ['authorization_pending', 'slow_down'], true)) {
            return false;
        }

        return $status >= 400 && $status < 500 && $status !== 429;
    }

    public function cancel(Request $request): JsonResponse
    {
        $this->singleUserOnly();

        $pending = $this->getPending($request);
        $this->forgetPending($request);
        if ($pending) {
            $this->cancelOnHub($pending['device_code']);
        }

        return new JsonResponse(['status' => 'cancelled']);
    }

    /**
     * `POST /api/community/hub/disconnect`: the Settings "Disconnect" button. The
     * Hub is told and the pairing forgotten whatever it answers; a panel that
     * is not paired answers the same way. Refused (409) while the signed-in
     * user's password is generated: the pairing is then their only way in.
     */
    public function disconnect(Request $request, HubDisconnection $disconnection): JsonResponse
    {
        $this->singleUserOnly();
        // The Hub login needs the pairing, and a generated password is unknown to the user.
        $user = $request->user();
        if ($user instanceof Model && (bool) $user->getAttribute('password_generated')) {
            return $this->error('Set a password in My account before disconnecting.', 409);
        }
        $disconnection->run();

        return new JsonResponse(['status' => 'disconnected'] + $this->pairing->summary());
    }

    /**
     * Per request, not at route registration: the edition can change.
     */
    private function singleUserOnly(): void
    {
        abort_unless(SingleUserMode::active($this->container), 404);
    }

    /**
     * @param  array<string, mixed>  $answer  the approved poll answer
     * @param  array{device_code: string, state: string, admin_url: ?string, server_name: ?string, expires_at: int}  $pending
     */
    private function activate(Request $request, array $answer, array $pending): JsonResponse
    {
        $store = $this->activation->storer($answer, $pending['admin_url']);
        if ($store === null) {
            return $this->result('expired', 'PanelAlpha sent an incomplete answer. Start again.');
        }

        $setupRequired = $this->setupState->required();
        // A guest whose setup was finished by someone else while the Hub was polled.
        if (! $setupRequired && $request->user() === null) {
            $this->cancelOnHub($pending['device_code']);

            return $this->error('The setup is already done.', 409);
        }

        // Hub sign-in takes only the approver's tickets, so the pairing must name them: no `user` (an
        // impersonated Hub session, a deleted account) pairs nothing, and the Hub's approval is closed.
        $approver = HubConnectedUser::fromAnswer($answer);
        if ($approver === null || $approver->id === null) {
            $this->cancelOnHub($pending['device_code']);

            return $this->result('unsupported', $setupRequired
                ? 'PanelAlpha did not say which account approved the connection, so the panel cannot be set up this way. Use the form instead.'
                : 'PanelAlpha did not say which account approved the connection. Approve it again while signed in to your own PanelAlpha account.');
        }

        if (! $setupRequired) {
            $store();
            $reported = $this->activation->sendFirstReport();

            // A 401 on the first report makes the client forget the pairing again.
            if (! $this->pairing->isPaired()) {
                return $this->result('expired', 'PanelAlpha did not accept the connection. Start again.');
            }
            Log::info('Connected to PanelAlpha', ['by' => $approver->email]);

            return new JsonResponse(['status' => 'connected', 'reported' => $reported] + $this->pairing->summary());
        }

        return $this->activateWithSetup($approver, $pending, $store);
    }

    /**
     * The first-run setup through Connect: the admin comes from the Hub
     * account that approved. The user, the server name, the pairing and the
     * first report share one transaction.
     *
     * @param  array{device_code: string, state: string, admin_url: ?string, server_name: ?string, expires_at: int}  $pending
     * @param  Closure(): void  $store
     */
    private function activateWithSetup(HubConnectedUser $user, array $pending, Closure $store): JsonResponse
    {
        $reported = false;
        try {
            $this->setup->run(
                fn (): Authenticatable => $this->users->createWithGeneratedPassword($user->email, $user->name),
                (string) $pending['server_name'],
                function () use ($store, &$reported): void {
                    // A 401 on the first report throws PairingRejected: no admin may be left on an unpaired panel.
                    $reported = $this->activation->storeAndReport($store);
                },
            );
        } catch (SetupAlreadyDone) {
            // A local submit won the race: the Hub must not keep an unconfirmed pairing.
            $this->cancelOnHub($pending['device_code']);

            return $this->error('The setup is already done.', 409);
        } catch (PairingRejected) {
            // The rollback undid the report's own forget; this drops the cached settings.
            $this->pairing->forget();

            return $this->result('expired', 'PanelAlpha did not accept the connection. Start again.');
        } catch (Throwable $e) {
            // The rollback left nothing behind, but the Hub holds an approval nobody can finish.
            Log::warning('PanelAlpha Hub setup failed', ['exception' => $e::class]);
            $this->pairing->forget();
            $this->cancelOnHub($pending['device_code']);

            return $this->result('expired', 'The setup could not be finished. Start again.');
        }
        Log::info('Connected to PanelAlpha', ['by' => $user->email, 'admin_created' => true]);

        return new JsonResponse(['status' => 'connected', 'reported' => $reported, 'setup_completed' => true] + $this->pairing->summary());
    }

    private function cancelOnHub(string $deviceCode): void
    {
        try {
            $this->hub->cancelConnectRequest($deviceCode);
        } catch (Throwable $e) {
            // An unconfirmed pairing expires on the Hub anyway.
            Log::warning('PanelAlpha Hub cancel failed', ['exception' => $e::class]);
        }
    }

    private function result(string $status, string $message): JsonResponse
    {
        return new JsonResponse(['status' => $status, 'message' => $message]);
    }

    private function error(string $message, int $status): JsonResponse
    {
        return new JsonResponse(['message' => $message], $status);
    }

    /**
     * @return array{device_code: string, state: string, admin_url: ?string, server_name: ?string, expires_at: int}|null
     */
    private function getPending(Request $request): ?array
    {
        $value = $request->hasSession() ? $request->session()->get(self::SESSION_KEY) : null;
        if (! is_string($value) || $value === '') {
            return null;
        }
        try {
            $data = Payload::object(json_decode(Crypt::decryptString($value), true));
        } catch (Throwable) {
            return null;
        }

        return [
            'device_code' => Payload::string($data['device_code'] ?? null),
            'state' => Payload::string($data['state'] ?? null),
            'admin_url' => Payload::nullableString($data['admin_url'] ?? null),
            'server_name' => Payload::nullableString($data['server_name'] ?? null),
            'expires_at' => Payload::int($data['expires_at'] ?? null) ?? 0,
        ];
    }

    private function forgetPending(Request $request): void
    {
        if ($request->hasSession()) {
            $request->session()->forget(self::SESSION_KEY);
        }
    }
}
