<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Support\SocialProviders;
use Illuminate\Contracts\Auth\StatefulGuard;
use Illuminate\Http\Request;
use Laravel\Socialite\AbstractUser;
use Laravel\Socialite\Contracts\Factory as SocialiteFactory;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\SocialiteManager;
use Laravel\Socialite\Two\AbstractProvider;
use Laravel\Socialite\Two\FacebookProvider;
use Laravel\Socialite\Two\GithubProvider;
use Laravel\Socialite\Two\GoogleProvider;
use Laravel\Socialite\Two\LinkedInOpenIdProvider;
use PanelAlpha\ClientArea\Support\Payload;
use RuntimeException;

/**
 * Social login. Community is strictly single-user, so the callback never
 * registers a user and never starts a trial.
 *
 * The old panel looked a user up by `<slug>_id` and created a new one when the
 * id was unknown, which in Community would have logged in whoever the provider
 * named. To rule out that account takeover, a provider login signs in
 * **only** the one user whose stored `social_auth.<provider>_id` equals the
 * provider id. An unseen id is linked only when the provider returns an email
 * that equals the panel user's email (case-insensitive) and vouches for it
 * (Google, LinkedIn OpenID, GitHub verified emails; Facebook has no
 * verified-email signal, so it never links). Every other identity answers the
 * old 422
 * (`account_already_exists`).
 *
 * A user with 2FA enabled is refused: the unchanged CA cannot finish a 2FA
 * challenge after a provider login, so the callback answers the old-style key-0
 * 422 without a session and without changing `social_auth`.
 *
 * Old: packages/api/app/Http/Controllers/AuthController.php:1168-1242.
 */
final class SocialLoginService
{
    /** The Socialite classes of the supported drivers (SocialProviders::SUPPORTED). */
    private const array DRIVER_CLASSES = [
        'google' => GoogleProvider::class,
        'facebook' => FacebookProvider::class,
        'github' => GithubProvider::class,
        'linkedin-openid' => LinkedInOpenIdProvider::class,
    ];

    public function __construct(private readonly StatefulGuard $guard) {}

    public function redirectUrl(string $provider): string
    {
        return $this->provider($provider)
            ->redirectUrl(SocialProviders::callbackUrl($provider))
            ->stateless()
            ->redirect()
            ->getTargetUrl();
    }

    /**
     * @throws \Symfony\Component\HttpKernel\Exception\NotFoundHttpException no user exists
     */
    public function callback(string $provider, Request $request): LoginResult
    {
        $remote = $this->provider($provider)
            ->redirectUrl(SocialProviders::callbackUrl($provider))
            ->stateless()
            ->user();

        // Community is single-user: there is exactly one panel user to link and log
        // in. Creating a second one (the old panel's registration branch) is
        // explicitly out of scope, so an empty table answers 404.
        $user = User::query()->orderBy('id')->first();

        if (! $user instanceof User) {
            abort(404, 'Not found');
        }

        $providerId = Payload::string($remote->getId());
        $social = Payload::object($user->getAttribute('social_auth'));
        $linkedId = Payload::string($social[$provider.'_id'] ?? null);

        if ($providerId === '') {
            return LoginResult::accountExists();
        }

        if ($linkedId !== '') {
            // Only the stored provider identity signs in; a different one would
            // take over the account.
            if ($linkedId !== $providerId) {
                return LoginResult::accountExists();
            }
        } elseif (! $this->vouchesForEmail($provider, $remote, $user)) {
            return LoginResult::accountExists();
        }

        // Refuse before persisting anything, so a refused
        // 2FA login changes no `social_auth` key and starts no session.
        if ($user->hasEnabledTwoFactorAuthentication()) {
            return LoginResult::twoFactorRefused();
        }

        $this->guard->login($user);
        $request->session()->regenerate();

        // Persist the link only after the session is established: a failed
        // login/session must not half-link the account, so the first-link id
        // is written here, not before the session check.
        if ($linkedId === '') {
            $social[$provider.'_id'] = $providerId;
        }

        // Keep every other provider's key: the
        // `<provider>_user` blob is the only entry this callback rewrites.
        $social[$provider.'_user'] = [
            'id' => $providerId,
            'name' => $remote->getName(),
            'email' => $remote->getEmail(),
            'nickname' => $remote->getNickname(),
            'avatar' => $remote->getAvatar(),
        ];
        $user->setAttribute('social_auth', $social);
        $user->save();

        return LoginResult::authenticated($user);
    }

    /**
     * Whether the provider's email may first-link this panel user: it must
     * equal the user's email (case-insensitive) and the provider must vouch
     * that the address is verified.
     */
    private function vouchesForEmail(string $provider, SocialiteUser $remote, User $user): bool
    {
        $email = $remote->getEmail();

        if (! is_string($email) || trim($email) === '') {
            return false;
        }

        if (strcasecmp(trim($email), (string) $user->email) !== 0) {
            return false;
        }

        // Socialite's `linkedin` driver is the legacy LinkedInProvider, which
        // returns the member's own primary address with no verified flag
        // (Two/LinkedInProvider.php:79-96,135); the CA's `linkedin` slug uses
        // the `linkedin-openid` driver instead, whose `email_verified` is the
        // vouch a first link requires. Google carries
        // `verified_email`, GitHub reads only the primary, verified address
        // (Two/GithubProvider.php:60-77), and Facebook's `verified` flags the
        // account, not the address, so it never links.
        $raw = $remote instanceof AbstractUser ? $remote->getRaw() : [];

        return match (SocialProviders::driver($provider)) {
            'google' => ($raw['verified_email'] ?? $raw['email_verified'] ?? false) === true,
            'linkedin-openid' => ($raw['email_verified'] ?? false) === true,
            'github' => true,
            default => false,
        };
    }

    /**
     * The Socialite facade types its driver as the read-only `Provider`
     * contract; `redirectUrl()`/`stateless()` live on the OAuth2 base class all
     * built-in drivers extend. The CA's slug is mapped to the driver Socialite
     * must build. Narrow once, honestly, instead of
     * widening the contract.
     */
    private function provider(string $provider): AbstractProvider
    {
        $name = SocialProviders::driver($provider);

        // The panel's own credentials (a paid edition's integrations) build a
        // fresh driver over the configured one, so neither the config nor
        // Socialite's driver cache keeps them once they change.
        $panel = SocialProviders::panelCredentials($provider);
        $manager = app(SocialiteFactory::class);
        $driver = $panel !== null && $manager instanceof SocialiteManager && isset(self::DRIVER_CLASSES[$name])
            ? $manager->buildProvider(self::DRIVER_CLASSES[$name], $panel + Payload::object(config('services.'.$name)))
            : Socialite::driver($name);

        if (! $driver instanceof AbstractProvider) {
            throw new RuntimeException("Provider [{$provider}] is not a Socialite OAuth2 provider.");
        }

        return $driver;
    }
}
