<?php

namespace PanelAlpha\Hub\Go;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use PanelAlpha\Hub\HubClient;
use PanelAlpha\Hub\HubPairing;
use Throwable;

/**
 * The bearer of PanelAlpha Go's catalog API: a token the Hub signs for this
 * pairing (`HubClient::credential('go')`, contract §10). It is kept encrypted
 * in the server cache until five minutes before it ends, then asked for again,
 * and never leaves the server.
 */
final class GoToken
{
    /** Ask the Hub again this long before the token ends. */
    public const int REFRESH_MARGIN_SECONDS = 300;

    public function __construct(
        private readonly HubPairing $pairing,
        private readonly HubClient $hub,
    ) {}

    /**
     * @throws GoNotConnected the panel is not paired with the Hub, or the Hub forgot the pairing
     * @throws GoUnavailable the Hub did not give a token
     */
    public function get(): string
    {
        $serverId = $this->pairing->serverId();
        if ($serverId === null || ! $this->pairing->isPaired()) {
            throw new GoNotConnected;
        }

        $key = self::cacheKey($serverId);
        $cached = $this->cached($key);
        if ($cached !== null) {
            return $cached;
        }

        try {
            $response = $this->hub->credential('go');
        } catch (Throwable $e) {
            throw new GoUnavailable('The PanelAlpha Hub could not be reached.', previous: $e);
        }

        if ($response->status() === 401) {
            throw new GoNotConnected;
        }

        $token = $response->successful() ? $response->json('token') : null;
        $expiresAt = $response->successful() ? $response->json('expires_at') : null;
        if (! is_string($token) || $token === '' || ! is_string($expiresAt)) {
            throw new GoUnavailable('The PanelAlpha Hub gave no Go token (HTTP '.$response->status().').');
        }

        try {
            $ttl = (int) now()->diffInSeconds(Carbon::parse($expiresAt), false) - self::REFRESH_MARGIN_SECONDS;
        } catch (Throwable) {
            $ttl = 0;
        }
        if ($ttl > 0) {
            Cache::put($key, Crypt::encryptString($token), $ttl);
        }

        return $token;
    }

    /**
     * Drop the kept token (Go refused it), so the next `get()` asks the Hub.
     */
    public function forget(): void
    {
        $serverId = $this->pairing->serverId();
        if ($serverId !== null) {
            Cache::forget(self::cacheKey($serverId));
        }
    }

    /**
     * One entry per pairing: a panel paired again with another account never
     * sends the previous account's token.
     */
    private static function cacheKey(string $serverId): string
    {
        return 'hub:go-token:'.hash('sha256', $serverId);
    }

    private function cached(string $key): ?string
    {
        $value = Cache::get($key);
        if (! is_string($value)) {
            return null;
        }

        try {
            return Crypt::decryptString($value);
        } catch (Throwable) {
            Cache::forget($key);

            return null;
        }
    }
}
