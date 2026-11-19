<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\PrimaryDomainSwitcher;
use PanelAlpha\EngineClient\Api\DomainsApi;
use PanelAlpha\EngineClient\Api\SystemApi;
use PanelAlpha\ClientArea\Events\ProjectDomainChanged;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\AddonDomain;
use PanelAlpha\ClientArea\Support\Payload;
use Throwable;

/**
 * Set a domain as the project's primary domain by
 * composing Engine calls, as the old panel did (old PanelAlpha/Account/
 * Domains::setAsPrimaryDomain): delete the addon → rename the main domain with
 * `PUT E:/{u}` → re-add the old main as an addon → keep the site's document root on
 * the promoted domain (the old main keeps it too) and restore the settings, then fire
 * `ProjectDomainChanged`, with a best-effort rollback if it fails after the addon
 * was removed. A rename the Engine refuses over a forwarding tunnel releases the
 * panel's previews and is retried once inside step 2
 * (`PreviewTunnelService::renameMainDomain()`), so that release never runs
 * before a write the rollback would have to undo. The old panel saved the new
 * main domain on the account, so the mirror is updated after success.
 *
 * Permanent panel code since 2026-10-15: the Engine will not get an atomic
 * switch, so this moved from client-area-legacy into the controller and
 * is the `PrimaryDomainSwitcher` default.
 */
final class ComposedPrimaryDomainSwitch implements PrimaryDomainSwitcher
{
    /**
     * The Engine refuses to rename a main domain onto a PanelAlpha Online name
     * (`MainDomainRename::refusal()`, code `domain_proxy_zone`): the proxy
     * serves only tunnels there. Refused before the addon is deleted, so the
     * attempt changes nothing.
     */
    public const string ONLINE_TARGET_REFUSAL = 'A PanelAlpha Online address is served through the proxy as a tunnel, so it cannot be the project\'s main domain. Use Change Domain to move the project to a domain of your own.';

    public function __construct(private readonly PreviewTunnelService $previews) {}

    /**
     * @throws ValidationException
     */
    public function switch(Application $application, string $domain): void
    {
        $api = new DomainsApi($application->engine());

        $target = null;
        $main = null;
        foreach ($api->domains($application->engineProject()) as $candidate) {
            if (($candidate['domain'] ?? null) === $domain) {
                $target = $candidate;
            }
            if (($candidate['type'] ?? null) === 'main') {
                $main = $candidate;
            }
        }

        // Old messages verbatim (messages.php:58,131,133,134 and the controller's
        // `invalid_domain`, ServerAccount/DomainController.php:379-381).
        if ($target === null) {
            throw ValidationException::withMessages(['domain' => ['Invalid domain']]);
        }
        if (($target['type'] ?? null) === 'main') {
            throw ValidationException::withMessages(['The selected domain is already the primary domain.']);
        }
        if (($target['type'] ?? null) !== 'addon') {
            throw ValidationException::withMessages(['Invalid domain type.']);
        }
        if (SystemApi::inOnlineZone($domain)) {
            throw ValidationException::withMessages(['domain' => [self::ONLINE_TARGET_REFUSAL]]);
        }
        if ($main === null) {
            throw ValidationException::withMessages(['Main Domain not found on the hosting account.']);
        }

        $oldMain = Payload::string($main['domain'] ?? '');
        $targetDetails = Payload::object($target['details'] ?? null);
        $mainDetails = Payload::object($main['details'] ?? null);
        $targetDoc = Payload::string($targetDetails['document_root'] ?? '');
        $oldMainDoc = Payload::string($mainDetails['document_root'] ?? '');

        // A switch leaves both domains on the site's root, so equal roots are allowed.
        if (
            $targetDoc === '' || $targetDoc === '/'
            || $oldMainDoc === '' || $oldMainDoc === '/'
        ) {
            throw ValidationException::withMessages(['Invalid document root directory.']);
        }

        $targetState = $this->captureDomainSettings($targetDetails);
        $mainState = $this->captureDomainSettings($mainDetails);

        $targetRemoved = false;
        $mainSwapped = false;

        try {
            // 1. delete the target addon domain
            $api->deleteDomain($application->engineProject(), $domain);
            $targetRemoved = true;

            // 2. make the target the project's main domain. A preview tunnel of
            //    the panel's on the old main domain refuses this rename
            //    (`domain_has_tunnels`): the previews are released then and the
            //    rename retried once, inside this step, so a failure before it
            //    still rolls the addon back.
            $this->previews->renameMainDomain($application, $domain, $oldMain);
            $mainSwapped = true;

            // The Engine's main domain has changed: mirror it now. A later
            // failure (re-add, document roots, settings) must not leave the
            // panel pointing at the old domain – the old
            // `setAsPrimaryDomain` saved right after the rename
            // (ServerAccount/DomainController.php:385-386), and only a failure
            // *before* the rename can put the addon back.
            $application->domain = $domain;
            $application->save();

            // 3. re-add the old main as an addon; both domains serve the site's root
            //    (the Engine store has no document_root – set it with a PUT)
            $api->createDomain($application->engineProject(), AddonDomain::withWwwAlias(['domain' => $oldMain, 'type' => 'addon']));

            // The rename deleted the old name's PanelAlpha Online tunnel with
            // it (the Engine releases the proxy site of the old main domain), so
            // the addon standing in its place gets that tunnel back and the
            // project keeps the address it had.
            $this->restoreOnlineTunnel($api, $application, $oldMain);

            // 4. restore the root and the settings each domain had, one PUT per domain
            $this->restoreDomainSettings($api, $application, $domain, $oldMainDoc, $targetState);
            $this->restoreDomainSettings($api, $application, $oldMain, $oldMainDoc, $mainState);
        } catch (Throwable $e) {
            // Best-effort rollback: only a failure before the rename leaves the
            // target absent, and only then can the addon be put back – after a
            // successful rename the Engine's main domain is already the target
            // (old best-effort catch).
            if ($targetRemoved && ! $mainSwapped) {
                try {
                    $api->createDomain($application->engineProject(), AddonDomain::withWwwAlias(['domain' => $domain, 'type' => 'addon']));
                    $api->updateDomain($application->engineProject(), $domain, ['document_root' => $targetDoc]);
                } catch (Throwable $rollback) {
                    report($rollback);
                }
            }

            throw $e;
        }

        // After the roots, so the WordPress search-replace reads the install the new main serves.
        ProjectDomainChanged::dispatch($application, $oldMain, $domain);
    }

    /**
     * Attach a PanelAlpha Online tunnel with the domain's own name, the one
     * shape the Engine registers for a project that was created on such a name
     * (`DomainAllocator::allocateOnline()`). Best effort: the switch has already
     * renamed the main domain, and a proxy that cannot be reached is reported
     * rather than turned into an error the user cannot act on.
     */
    private function restoreOnlineTunnel(DomainsApi $api, Application $application, string $domain): void
    {
        if (! SystemApi::inOnlineZone($domain)) {
            return;
        }

        try {
            $api->createTunnel($application->engineProject(), $domain, $domain, 'panelalpha', 'default');
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * @param  array<string, mixed>  $details  Engine domain `details`
     * @return array{redirect_enabled: bool, redirect_url: string|null, force_https_redirect: bool}
     */
    private function captureDomainSettings(array $details): array
    {
        return [
            'redirect_enabled' => (bool) ($details['redirect_enabled'] ?? false),
            'redirect_url' => Payload::nullableString($details['redirect_url'] ?? null),
            'force_https_redirect' => (bool) ($details['force_https_redirect'] ?? false),
        ];
    }

    /**
     * A domain's one PUT after the switch; a refused setting falls back to the root alone.
     *
     * @param  array{redirect_enabled: bool, redirect_url: string|null, force_https_redirect: bool}  $state
     */
    private function restoreDomainSettings(
        DomainsApi $api,
        Application $application,
        string $domain,
        string $documentRoot,
        array $state,
    ): void {
        try {
            $api->updateDomain($application->engineProject(), $domain, [
                'document_root' => $documentRoot,
                'redirect_enabled' => $state['redirect_enabled'],
                'redirect_url' => $state['redirect_url'],
                'force_https_redirect' => $state['force_https_redirect'],
            ]);
        } catch (Throwable $e) {
            // Best-effort restore (old restoreDomainSettings); still log it.
            report($e);

            try {
                $api->updateDomain($application->engineProject(), $domain, ['document_root' => $documentRoot]);
            } catch (Throwable $rootFailure) {
                report($rootFailure);
            }
        }
    }
}
