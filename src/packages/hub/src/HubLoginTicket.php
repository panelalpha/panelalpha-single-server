<?php

namespace PanelAlpha\Hub;

use Illuminate\Support\Facades\Cache;

/**
 * Verifies a PanelAlpha Connect (Hub) login ticket, PANEL-LOGIN-CONTRACT.md
 * 2.2-2.3 (old
 * `packages/api/app/Lib/Hub/HubLoginTicket.php`). Shared by the Community Client Area's ticket login and the
 * paid Admin Area's; each product decides whom a valid ticket signs
 * in.
 *
 * The ticket is a compact JWT signed HS256 with the panel's server_secret over
 * `{iss, aud: server_id, sub: <Hub user id>, email, name, jti, iat, exp, state?}`.
 * Once the pairing names the Hub user who approved it, only that user's ticket
 * passes: anyone else the Hub would issue one for (a team member, a support
 * session) must not land in the panel's account. Every failed check returns
 * null so callers answer all failures the same way. Tickets are never logged.
 */
final class HubLoginTicket
{
    public function __construct(private readonly HubPairing $pairing) {}

    public const int CLOCK_TOLERANCE = 30;

    /** How long a used `jti` is remembered (contract 2.3: 5 minutes). */
    public const int JTI_TTL = 300;

    /** The longest `exp - iat` accepted, so a used `jti` is remembered for as long as its ticket is valid. */
    public const int MAX_LIFETIME = self::JTI_TTL;

    /** Why the last ticket was refused (no ticket data), for the log. */
    public ?string $lastFailure = null;

    /**
     * @param  string|null  $sessionState  the state the panel kept when it started the login, if it did
     * @return array<string, mixed>|null the claims when the ticket is valid
     */
    public function verify(string $ticket, ?string $sessionState): ?array
    {
        $this->lastFailure = null;
        if (! $this->pairing->isPaired()) {
            return $this->fail('not_paired');
        }

        $parts = explode('.', $ticket);
        if (count($parts) !== 3) {
            return $this->fail('malformed');
        }
        [$encodedHeader, $encodedClaims, $encodedSignature] = $parts;

        $header = json_decode((string) self::base64UrlDecode($encodedHeader), true);
        $claims = json_decode((string) self::base64UrlDecode($encodedClaims), true);
        $signature = self::base64UrlDecode($encodedSignature);
        if (! is_array($header) || ! is_array($claims) || $signature === null) {
            return $this->fail('malformed');
        }
        $claims = array_combine(array_map(static fn (mixed $key): string => (string) $key, array_keys($claims)), array_values($claims));

        // only HS256, never "none" or anything else
        if (($header['alg'] ?? null) !== 'HS256') {
            return $this->fail('alg');
        }

        $expected = hash_hmac('sha256', $encodedHeader.'.'.$encodedClaims, (string) $this->pairing->serverSecret(), true);
        if (! hash_equals($expected, $signature)) {
            return $this->fail('signature');
        }

        if (rtrim(self::text($claims['iss'] ?? null), '/') !== rtrim($this->pairing->hubUrl(), '/')) {
            return $this->fail('iss');
        }
        if (self::text($claims['aud'] ?? null) !== (string) $this->pairing->serverId()) {
            return $this->fail('aud');
        }
        // The Hub names the signed-in Hub user (2026-10-28): `sub` is their Hub
        // id and `email` their full address (the old `sub: main_admin` + `by` ticket is gone).
        $sub = $claims['sub'] ?? null;
        if (! is_string($sub) || $sub === '') {
            return $this->fail('sub');
        }
        $pairedUser = $this->pairing->hubUserId();
        if ($pairedUser !== null && ! hash_equals($pairedUser, $sub)) {
            return $this->fail('sub_not_paired_user');
        }
        $email = $claims['email'] ?? null;
        if (! is_string($email) || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return $this->fail('email');
        }

        $now = time();
        $exp = $claims['exp'] ?? null;
        if (! is_int($exp) || $exp + self::CLOCK_TOLERANCE < $now) {
            return $this->fail('expired');
        }
        $iat = $claims['iat'] ?? null;
        if (! is_int($iat) || $iat - self::CLOCK_TOLERANCE > $now) {
            return $this->fail('iat_future');
        }
        if ($exp - $iat > self::MAX_LIFETIME) {
            return $this->fail('lifetime');
        }

        // login started on the panel: state must match this visitor's session;
        // started on the Hub: no state at all
        $state = $claims['state'] ?? null;
        if ($state !== null || $sessionState !== null) {
            if (! is_string($state) || $sessionState === null || ! hash_equals($sessionState, $state)) {
                return $this->fail('state');
            }
        }

        // single use, remembered until the ticket expires; checked last so a ticket failing another check is not burnt
        $jti = $claims['jti'] ?? null;
        $remember = max(self::JTI_TTL, $exp + self::CLOCK_TOLERANCE - $now + 1);
        if (! is_string($jti) || strlen($jti) < 16 || ! Cache::add('hub-login-jti:'.hash('sha256', $jti), 1, $remember)) {
            return $this->fail('jti');
        }

        return $claims;
    }

    private function fail(string $reason): null
    {
        $this->lastFailure = $reason;

        return null;
    }

    private static function text(mixed $value): string
    {
        return is_string($value) ? $value : '';
    }

    private static function base64UrlDecode(string $value): ?string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/').str_repeat('=', (4 - strlen($value) % 4) % 4), true);

        return $decoded === false ? null : $decoded;
    }
}
