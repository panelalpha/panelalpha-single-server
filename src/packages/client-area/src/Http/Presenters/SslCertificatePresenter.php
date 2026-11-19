<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use PanelAlpha\ClientArea\Support\Payload;

/**
 * Shapes an Engine SSL certificate the way the old Client Area resource did
 * (old PanelAlpha driver `Account/SslCerts::getDomainInstalledCert`):
 * `id`, `domain`, `domains`, `common_name`, `issuer_name`, `not_before`,
 * `not_after`, `self_signed`, `name_match`, `certificate_text`.
 *
 * Mappings the Engine does differently:
 *  - `name_match` ← Engine `covers_domain` (the old panel compared the common
 *    name with the SAN list);
 *  - `certificate_text` ← Engine `certificate` (the PEM body);
 *  - `domain` ← Engine `common_name`.
 *
 * The CA reads `self_signed`, `name_match` and `issuer_name`
 * (`apis/Hosting.js:30-38`, `views/hosting/Domains.vue:178-190`,
 * `views/instance/advanced/Security.vue:40-41`).
 *
 * Validity is the Engine's verdict, never re-derived here: `status` is
 * `CertificateStatus::of()` (Engine `core/app/Lib/Ssl/CertificateStatus.php`) –
 * `trusted`, `self_signed`, `untrusted_issuer`, `expired`, `not_yet_valid`,
 * `domain_mismatch` or `unreadable` – passed through with `chain_trusted`,
 * `expires_at` and `days_remaining`; `valid` is `status === trusted`. The old
 * panel never looked at the dates, so an expired certificate read as secure.
 */
final class SslCertificatePresenter
{
    /**
     * @param  array<string, mixed>|null  $certificate  Engine `SslCertificateResource` data
     * @return array<string, mixed>|null
     */
    public function present(?array $certificate): ?array
    {
        return $this->shape($certificate, translateSelfSigned: true);
    }

    /**
     * The installed-certificate route's shape: the old `getInstalledCertificate`
     * returned these six keys (ServerAccount/SslController.php:60-83) and never
     * applied the "Self Signed" label; v1 adds the Engine's validity verdict.
     *
     * @param  array<string, mixed>|null  $certificate  Engine `SslCertificateResource` data
     * @return array{id: string, issuer_name: string, not_before: mixed, not_after: mixed, self_signed: bool, name_match: bool, status: ?string, valid: bool, chain_trusted: ?bool, expires_at: ?string, days_remaining: ?int}|null
     */
    public function presentInstalled(?array $certificate): ?array
    {
        $shaped = $this->shape($certificate, translateSelfSigned: false);
        if ($shaped === null) {
            return null;
        }

        return [
            'id' => Payload::string($shaped['id'] ?? ''),
            'issuer_name' => Payload::string($shaped['issuer_name'] ?? ''),
            'not_before' => $shaped['not_before'] ?? null,
            'not_after' => $shaped['not_after'] ?? null,
            'self_signed' => Payload::bool($shaped['self_signed'] ?? null) ?? false,
            'name_match' => Payload::bool($shaped['name_match'] ?? null) ?? false,
            'status' => Payload::nullableString($shaped['status'] ?? null),
            'valid' => Payload::bool($shaped['valid'] ?? null) ?? false,
            'chain_trusted' => Payload::bool($shaped['chain_trusted'] ?? null),
            'expires_at' => Payload::nullableString($shaped['expires_at'] ?? null),
            'days_remaining' => Payload::int($shaped['days_remaining'] ?? null),
        ];
    }

    /**
     * A certificate the Engine's `ssl-check` received, in the detected routes'
     * shape: the old panel's five keys (`issuer_name`, `not_before`/`not_after`
     * as unix time, `self_signed`, `name_match`), the Engine verdict (`status`,
     * `valid`, `chain_trusted`, `expires_at`, `days_remaining`) and what only a
     * live check knows: `points_here` (DNS points at this host, or the domain
     * is served through a tunnel of its own name),
     * `serves_installed` (the webserver serves the installed certificate) and
     * `checked_at`. `$side` is `public` (at the address the domain's DNS gives:
     * what a visitor gets) or `engine` (at the project's webserver: what this
     * host serves). null when that side received no certificate
     * (`not_resolving`, `refused_address`, `unreachable`), as the old probe
     * answered when the handshake failed.
     *
     * @param  array<string, mixed>  $check  Engine `SslCheck` data
     * @param  'public'|'engine'  $side
     * @return array<string, mixed>|null
     */
    public function presentServed(array $check, string $side = 'public'): ?array
    {
        $probe = Payload::object($check[$side] ?? null);
        $certificate = Payload::object($probe['certificate'] ?? null);
        if ($certificate === []) {
            return null;
        }

        $status = Payload::nullableString($certificate['status'] ?? null);
        $signer = Payload::object($certificate['signer'] ?? null);
        $issuer = Payload::nullableString($certificate['issuer'] ?? null)
            ?? Payload::nullableString($signer['common_name'] ?? null)
            ?? '';
        $dns = Payload::object($check['dns'] ?? null);
        $engine = Payload::object($check['engine'] ?? null);
        $validFrom = Payload::nullableString($certificate['valid_from'] ?? null);
        $expiresAt = Payload::nullableString($certificate['expires_at'] ?? null);

        return [
            'issuer_name' => $issuer,
            'not_before' => self::unixTime($validFrom),
            'not_after' => self::unixTime($expiresAt),
            'self_signed' => Payload::bool($certificate['self_signed'] ?? null) ?? false,
            'name_match' => Payload::bool($certificate['covers_domain'] ?? null) ?? false,
            'status' => $status,
            'valid' => $status === 'trusted',
            'chain_trusted' => Payload::bool($certificate['chain_trusted'] ?? null),
            'expires_at' => $expiresAt,
            'days_remaining' => Payload::int($certificate['days_remaining'] ?? null),
            'points_here' => Payload::bool($dns['points_here'] ?? null),
            'serves_installed' => Payload::bool($engine['serves_installed'] ?? null),
            'checked_at' => Payload::nullableString($check['checked_at'] ?? null),
        ];
    }

    /**
     * The SSL settings certificate (the installed file, for its PEM and names)
     * judged by what the project's webserver really serves: the verdict keys
     * come from `ssl-check`'s `engine` side, the file only supplies what a
     * handshake cannot (`certificate_text`, `domains`, `common_name`).
     *
     * @param  array<string, mixed>  $presented  {@see present()} of the installed file
     * @param  array<string, mixed>  $served  {@see presentServed()} of the `engine` side
     * @return array<string, mixed>
     */
    public function judgedByServed(array $presented, array $served): array
    {
        $judged = array_replace($presented, array_intersect_key($served, array_flip([
            'issuer_name', 'not_before', 'not_after', 'self_signed', 'name_match', 'status', 'valid',
            'chain_trusted', 'expires_at', 'days_remaining', 'points_here', 'serves_installed', 'checked_at',
        ])));
        if ($judged['self_signed'] === true) {
            $judged['issuer_name'] = trans('client-area::general.self_signed');
        }

        return $judged;
    }

    private static function unixTime(?string $iso): ?int
    {
        $time = $iso === null ? false : strtotime($iso);

        return $time === false ? null : $time;
    }

    /**
     * @param  array<string, mixed>|null  $certificate
     * @return array<string, mixed>|null
     */
    private function shape(?array $certificate, bool $translateSelfSigned): ?array
    {
        if ($certificate === null) {
            return null;
        }

        $commonName = Payload::string($certificate['common_name'] ?? '');
        /** @var mixed $rawDomains */
        $rawDomains = $certificate['domains'] ?? null;
        $domains = array_values(array_filter(
            is_array($rawDomains) ? $rawDomains : [],
            static fn ($domain): bool => is_string($domain),
        ));

        // The Engine reports both booleans; fall back to the old computation for
        // an older answer that carries only the names.
        $selfSigned = array_key_exists('self_signed', $certificate)
            ? (bool) $certificate['self_signed']
            : ($commonName !== '' && $commonName === ($certificate['issuer_common_name'] ?? null));
        $nameMatch = array_key_exists('covers_domain', $certificate)
            ? (bool) $certificate['covers_domain']
            : in_array($commonName, $domains, true);

        $issuer = Payload::string($certificate['issuer_name'] ?? 'Unknown');
        $status = Payload::nullableString($certificate['status'] ?? null);

        return [
            // The old integration returned an empty id for an installed cert.
            'id' => '',
            'domain' => $commonName,
            'domains' => $domains,
            'common_name' => $commonName,
            // The old showDomainSettings relabelled a self-signed certificate
            // (ServerAccount/SslController.php:339-341, lang/en/api/general.php:12).
            'issuer_name' => $selfSigned && $translateSelfSigned ? trans('client-area::general.self_signed') : $issuer,
            'not_before' => $certificate['not_before'] ?? null,
            'not_after' => $certificate['not_after'] ?? null,
            'self_signed' => $selfSigned,
            'name_match' => $nameMatch,
            'certificate_text' => Payload::string($certificate['certificate'] ?? ''),
            'status' => $status,
            'valid' => $status === 'trusted',
            'chain_trusted' => Payload::bool($certificate['chain_trusted'] ?? null),
            'expires_at' => Payload::nullableString($certificate['expires_at'] ?? null),
            'days_remaining' => Payload::int($certificate['days_remaining'] ?? null),
        ];
    }
}
