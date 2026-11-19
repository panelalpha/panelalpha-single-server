<?php

namespace PanelAlpha\ClientArea\Hosting;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\DomainsApi;
use PanelAlpha\EngineClient\Api\MysqlApi;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use Throwable;

/**
 * A project's preview tunnel: a sibling PanelAlpha Online tunnel
 * on the project's main domain that the browser can reach before DNS points at
 * the server. The Engine lists a tunnel's `purpose` and `valid_until` and
 * expires a `preview` tunnel itself (`tunnels:expire`, Engine `08ea0992b`), so
 * the panel keeps no tunnel cache: it reads the live preview tunnel from
 * `GET …/tunnels` and creates one only when there is none (the panel's
 * `preview_tunnels` table is gone).
 *
 * Since Engine commit `f72fec570` a `preview` tunnel is
 * registered with the main domain as its target: the proxy forwards
 * `Host: <domain>` and rewrites the domain back to the tunnel name in the
 * answer's body, `Location` and cookies, so any site – WordPress included –
 * answers as itself while the browser stays on the tunnel name. The Engine
 * keeps that target in the tunnel's `details.target_domain`; a preview created
 * before the change has none and still forwards its own name until it expires,
 * so the panel never reuses one.
 *
 * The preview SSOs swap the SSO URL's host for the tunnel's.
 */
final class PreviewTunnelService
{
    /**
     * The preview tunnel's Engine lifetime in minutes. The old
     * panel's default temporary-url duration was 15 minutes
     * (`Lib/Apis/WithoutDns.php:190`), and the Engine's `ttl_minutes` minimum is
     * 5; the Engine removes the tunnel when it expires.
     */
    public const TTL_MINUTES = 15;

    /** Extra seconds over the Engine call budget before the per-project lock expires. */
    public const LOCK_MARGIN_SECONDS = 30;

    /** Key-0 refusal the CA shows as an alert when another create holds the lock. */
    public const LOCK_REFUSAL = 'A preview tunnel is already being created for this project. Try again in a moment.';

    /**
     * The old `api/custom_validation.create_preview_site_failed` text (key 0,
     * brief §7.5): the old controller answered it whenever the temporary domain
     * could not be created.
     */
    public const CREATE_FAILED = 'Could not create temporary site URL';

    /** The Engine's 409 code when it drew no free `preview-<8>` label (`TunnelHostnameUnavailableException::CODE`). */
    private const HOSTNAME_UNAVAILABLE = 'tunnel_hostname_unavailable';

    /**
     * The Engine's 422 `problems[].code` while a tunnel forwards to the main
     * domain a rename would leave behind (`Lib/Domains/MainDomainRename.php:291`).
     */
    private const TUNNELS_REFUSAL = 'domain_has_tunnels';

    /**
     * The project's live preview tunnel, created when it has none.
     *
     * A second request must not race the first into creating a second tunnel
     *So the list check and the create run under a per-project
     * lock; a concurrent request gets the old-style key-0 refusal.
     *
     * @return array{hostname: string, valid_until: CarbonImmutable|null}
     *
     * @throws ValidationException no main domain, a held lock, or no free label
     */
    public function tunnel(Application $application): array
    {
        $domain = (string) ($application->domain ?? '');
        if ($domain === '') {
            // The old controller reached the same text when the account had no
            // main domain to attach the temporary domain to.
            throw ValidationException::withMessages([self::CREATE_FAILED]);
        }

        $lock = Cache::lock(self::lockKey($application->id), self::lockSeconds());
        if (! $lock->get()) {
            throw ValidationException::withMessages([self::LOCK_REFUSAL]);
        }

        try {
            return $this->liveTunnel($application, $domain) ?? $this->createTunnel($application, $domain);
        } finally {
            $lock->release();
        }
    }

    /**
     * phpMyAdmin preview SSO: the Engine token URL served through
     * the project's preview tunnel.
     *
     * @return array{data: array{url: string}}
     */
    public function phpmyadminPreviewSso(Application $application): array
    {
        $tunnel = $this->tunnel($application);

        $token = (new MysqlApi($application->engine()))->phpmyadminSsoToken($application->engineProject());
        $url = Payload::nullableString($token['url'] ?? null) ?? '';

        return ['data' => ['url' => self::swapHost($url, $tunnel['hostname'])]];
    }

    /**
     * Swap a URL's host for the tunnel host the browser can reach before DNS
     * points at the server (old `MysqlController::phpmyadminPreviewSsoUrl`, the
     * old SSO previews' `Str::replace($originHost, $tempHost, $ssoUrl)`).
     */
    public static function swapHost(string $url, string $host): string
    {
        $originHost = parse_url($url, PHP_URL_HOST);
        if (! is_string($originHost) || $originHost === '') {
            return $url;
        }

        return Str::replace($originHost, $host, $url);
    }

    /**
     * The per-application lock key that refuses a second concurrent preview
     * tunnel create. Public so a test can hold the lock and prove
     * the refusal.
     */
    public static function lockKey(int $applicationId): string
    {
        return "user-application:preview-tunnel:{$applicationId}";
    }

    /**
     * The lock covers two Engine calls – the tunnel list and the create – each
     * with `engine_timeout`, so it must outlast both with a margin or it could
     * expire mid-call and let a second request create a second Engine tunnel.
     * The Engine draws a free label and retries itself, so there is no panel
     * retry loop to cover any more.
     */
    public static function lockSeconds(): int
    {
        return 2 * (Payload::int(config('client-area.engine_timeout')) ?? 0) + self::LOCK_MARGIN_SECONDS;
    }

    /**
     * The newest-expiring `preview` tunnel on the main domain whose
     * engine-enforced `valid_until` is still in the future and which forwards
     * the main domain as Host. A `default` tunnel never expires and is never
     * served as a temporary preview; the Engine already omits
     * expired tunnels from the list. A preview whose `details.target_domain` is
     * missing (created before Engine `f72fec570`, it forwards its own name, which
     * WordPress canonical-redirects) or names another domain is stale and never
     * reused; the Engine writes the target lower-cased, so it is
     * compared without case. A failed list call is never treated as "none" – it
     * bubbles, so an Engine hiccup cannot create a second tunnel.
     *
     * @return array{hostname: string, valid_until: CarbonImmutable}|null
     */
    private function liveTunnel(Application $application, string $domain): ?array
    {
        $live = null;
        foreach ((new DomainsApi($application->engine()))->tunnels($application->engineProject(), $domain) as $tunnel) {
            $hostname = Payload::nullableString($tunnel['hostname'] ?? null) ?? '';
            if ($hostname === '' || Payload::nullableString($tunnel['purpose'] ?? null) !== 'preview') {
                continue;
            }

            if (! self::forwardsDomain($tunnel, $domain)) {
                continue;
            }

            $validUntil = self::timestamp($tunnel['valid_until'] ?? null);
            if ($validUntil === null || ! $validUntil->isFuture()) {
                continue;
            }

            if ($live === null || $validUntil->greaterThan($live['valid_until'])) {
                $live = ['hostname' => $hostname, 'valid_until' => $validUntil];
            }
        }

        return $live;
    }

    /**
     * Rename the project's main domain, releasing the panel's preview tunnels
     * only when the Engine refuses the rename because of them.
     *
     * The Engine checks the rename before it changes anything
     * (`Rules/FreeMainDomain.php:28` → `Lib/Domains/MainDomainRename.php:260`)
     * and answers 422 while a tunnel still forwards to the old name, with the
     * stable `problems[].code` `domain_has_tunnels` (`MainDomainRename.php:291`,
     * put in the body by `Exceptions/Handler.php:175-184`). Only that refusal
     * releases the previews – the panel's own disposable tunnels – and retries
     * the rename once. Sending the rename first is what makes a stale mirror or
     * a failed tunnel list read unable to abort a rename the Engine accepts, and
     * what keeps the preview link, the preview SSOs and phpMyAdmin of a project
     * whose rename is refused for any other reason (a taken domain, a busy
     * project, an Engine failure). A tunnel of another purpose stays, and the
     * retry's refusal names it.
     *
     * @return array<string, mixed> the Engine's rename answer `data`
     */
    public function renameMainDomain(Application $application, string $domain, string $oldDomain): array
    {
        // Engine: core/app/Http/Controllers/UserController.php:1091 -> UserController::update
        $api = new ProjectsApi($application->engine());

        try {
            return $api->renameDomain($application->engineProject(), $domain);
        } catch (EngineValidationException $e) {
            if (! self::refusesForTunnels($e)) {
                throw $e;
            }
        }

        $this->releasePreviews($application, $oldDomain);

        // The panel's previews are gone: the Engine now either accepts the
        // rename or refuses it again over a tunnel of another purpose, whose
        // own sentence names that tunnel for the user.
        return $api->renameDomain($application->engineProject(), $domain);
    }

    /**
     * Whether the Engine's 422 is the tunnel refusal – read from its stable
     * `problems[].code` (`Exceptions/Handler.php:175-184`), never from the
     * English sentence.
     */
    private static function refusesForTunnels(EngineValidationException $e): bool
    {
        foreach ($e->problems as $problem) {
            if (Payload::nullableString($problem['code'] ?? null) === self::TUNNELS_REFUSAL) {
                return true;
            }
        }

        return false;
    }

    /**
     * Delete the preview tunnels on `$domain`, the step `renameMainDomain()`
     * runs when the Engine refused the rename because of them.
     *
     * A preview is the panel's own disposable tunnel – opened by the preview
     * link or a preview SSO, never shown to the user as a tunnel – so it goes.
     * A tunnel with any other purpose stays. An already-removed tunnel (404) is
     * fine, and so is a domain the Engine does not have at all: it has no
     * tunnels to release (`TunnelController.php:268` answers that 404). A failed
     * list read is never "no tunnels" and still bubbles.
     */
    public function releasePreviews(Application $application, string $domain): void
    {
        if ($domain === '') {
            return;
        }

        $api = new DomainsApi($application->engine());

        try {
            $tunnels = $api->tunnels($application->engineProject(), $domain);
        } catch (EngineRequestException $e) {
            if ($e->engineStatus !== 404) {
                throw $e;
            }

            return;
        }

        foreach ($tunnels as $tunnel) {
            $hostname = Payload::nullableString($tunnel['hostname'] ?? null) ?? '';
            if ($hostname === '' || Payload::nullableString($tunnel['purpose'] ?? null) !== 'preview') {
                continue;
            }

            try {
                $api->deleteTunnel($application->engineProject(), $domain, $hostname);
            } catch (EngineRequestException $e) {
                if ($e->engineStatus !== 404) {
                    throw $e;
                }
            }
        }
    }

    /**
     * Whether the tunnel's proxy forwards `$domain` as Host: its
     * `details.target_domain` (`Models/Tunnel.php` `forwardedHost()`) names it.
     *
     * @param  array<string, mixed>  $tunnel
     */
    private static function forwardsDomain(array $tunnel, string $domain): bool
    {
        $details = Payload::object($tunnel['details'] ?? null);
        $target = Payload::nullableString($details['target_domain'] ?? null) ?? '';

        return $target !== '' && strcasecmp($target, $domain) === 0;
    }

    /**
     * Create a `preview` tunnel with the panel's TTL. The Engine allocates the
     * `preview-<8>` label (no `hostname` sent) and draws again when one is
     * taken; it answers 409 `tunnel_hostname_unavailable` after five, which the
     * panel shows as the old "could not create" refusal.
     *
     * @return array{hostname: string, valid_until: CarbonImmutable|null}
     */
    private function createTunnel(Application $application, string $domain): array
    {
        try {
            $tunnel = (new DomainsApi($application->engine()))->createTunnel(
                $application->engineProject(),
                $domain,
                null,
                purpose: 'preview',
                ttlMinutes: self::TTL_MINUTES,
            );
        } catch (EngineRequestException $e) {
            if ($e->engineStatus === 409 && $e->engineCode === self::HOSTNAME_UNAVAILABLE) {
                throw ValidationException::withMessages([self::CREATE_FAILED]);
            }

            throw $e;
        }

        $hostname = Payload::nullableString($tunnel['hostname'] ?? null) ?? '';
        if ($hostname === '') {
            throw ValidationException::withMessages([self::CREATE_FAILED]);
        }

        return ['hostname' => $hostname, 'valid_until' => self::timestamp($tunnel['valid_until'] ?? null)];
    }

    /**
     * The resource's top-level `valid_until` (ISO-8601, the engine-enforced
     * expiry; `details.valid_until` is the proxy's own value the Engine does not
     * act on), or null when it is missing or unreadable.
     */
    private static function timestamp(mixed $value): ?CarbonImmutable
    {
        $raw = Payload::nullableString($value);
        if ($raw === null || $raw === '') {
            return null;
        }

        try {
            return CarbonImmutable::parse($raw)->utc();
        } catch (Throwable) {
            return null;
        }
    }
}
