<?php

namespace App\Support;

use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Contracts\SocialLoginCredentials;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Social-login providers the panel offers.
 *
 * The old panel read its enabled providers from the `integrations` table; Community
 * has no admin and no integration model, so a provider is offered when
 * its Laravel Socialite credentials are configured. A paid edition keeps them
 * in the panel ({@see SocialLoginCredentials}, the Admin Area's auth
 * integrations); those are preferred over `config/services.php`, and the
 * driver is then built from them without changing the config. Only drivers shipped with
 * `laravel/socialite` are supported – Microsoft would need an extra package,
 * which is not part of the approved Socialite dependency.
 *
 * The CA's `linkedin` slug maps to Socialite's `linkedin-openid` driver, the
 * only LinkedIn driver that carries a verified-email signal (`email_verified`)
 * a first account link requires. The CA keeps its own
 * slug, so `/home` still advertises `linkedin`.
 */
final class SocialProviders
{
    /** @var list<string> */
    public const SUPPORTED = ['google', 'facebook', 'github', 'linkedin'];

    /** CA slug => Socialite driver (a CA slug not listed here is its own driver). */
    private const DRIVERS = [
        'linkedin' => 'linkedin-openid',
    ];

    /**
     * The Socialite driver a CA provider slug uses.
     */
    public static function driver(string $provider): string
    {
        return self::DRIVERS[$provider] ?? $provider;
    }

    /**
     * The slugs `/home` exposes as `app.integrations.auth`
     * (old `Integration::listEnabledAuthProviders()`,
     * packages/api/app/Http/Controllers/AuthController.php:872).
     *
     * @return list<string>
     */
    public static function enabled(): array
    {
        return array_values(array_filter(
            self::SUPPORTED,
            static fn (string $provider): bool => self::isEnabled($provider),
        ));
    }

    public static function isEnabled(string $provider): bool
    {
        if (! in_array($provider, self::SUPPORTED, true)) {
            return false;
        }

        return self::credentials($provider) !== null;
    }

    /**
     * The provider's OAuth client: the panel's own credentials when it keeps
     * them, else `config/services.php`; null when either half is missing.
     *
     * @return array{client_id: string, client_secret: string}|null
     */
    public static function credentials(string $provider): ?array
    {
        return self::panelCredentials($provider) ?? self::complete([
            'client_id' => Payload::nullableString(config('services.'.self::driver($provider).'.client_id')) ?? '',
            'client_secret' => Payload::nullableString(config('services.'.self::driver($provider).'.client_secret')) ?? '',
        ]);
    }

    /**
     * The credentials the panel keeps for the provider (a paid edition's
     * integrations), or null.
     *
     * @return array{client_id: string, client_secret: string}|null
     */
    public static function panelCredentials(string $provider): ?array
    {
        $credentials = app(SocialLoginCredentials::class)->for($provider);

        return $credentials === null ? null : self::complete($credentials);
    }

    /**
     * @param  array{client_id: string, client_secret: string}  $credentials
     * @return array{client_id: string, client_secret: string}|null
     */
    private static function complete(array $credentials): ?array
    {
        return $credentials['client_id'] !== '' && $credentials['client_secret'] !== '' ? $credentials : null;
    }

    /**
     * The OAuth callback the provider redirects the browser to: the Client Area
     * SPA route, not the API (old `AbstractAuth::getCallbackUrl()`,
     * packages/api/app/Lib/Integrations/Auth/AbstractAuth.php:50-55).
     */
    public static function callbackUrl(string $provider): string
    {
        return app(PanelUrl::class)->base().'/auth/'.$provider.'/callback';
    }
}
