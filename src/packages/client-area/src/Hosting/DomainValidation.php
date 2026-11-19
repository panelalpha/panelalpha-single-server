<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\Api\SystemApi;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Panel-side domain checks for the onboarding domain step (old
 * User\DomainController). Verifies syntax and that the domain is neither
 * already used by another project nor a base domain of one.
 *
 * The panel-side TLS/DNS probe that used to live here (`resolves`,
 * `addressFor`, `engineAddress`) moved to the legacy `Hosting\DomainProbe`;
 * this class keeps the Engine-free checks so the
 * controller still has no outbound-probe dependency.
 */
final class DomainValidation
{
    public function __construct(
        private readonly EngineResolver $engines,
        private readonly ApplicationRepository $applications,
        private readonly EngineHealth $health,
    ) {}

    /**
     * @throws ValidationException
     */
    public function assertAvailable(Authenticatable $user, string $domain): void
    {
        $name = $this->normalize($domain);
        if (! $this->isValidName($name)) {
            throw ValidationException::withMessages(['domain' => ['Invalid domain name.']]);
        }

        // The domains the asking user can see. In Community the user sees every
        // mirrored project, so the subdomain-of rule below never fires.
        $visible = [];
        foreach ($this->applications->forUser($user, refresh: false) as $application) {
            $known = $this->normalize((string) $application->domain);
            if ($known !== '') {
                $visible[$known] = true;
            }
        }

        // The exact-match "taken" check stays a global integrity check: the
        // domain is taken when any user's project already has it, so the source
        // is domainsInUse() and never forUser().
        foreach ($this->applications->domainsInUse() as $known) {
            $known = $this->normalize($known);
            if ($known === '') {
                continue;
            }

            if ($known === $name) {
                throw ValidationException::withMessages(['domain' => ['Domain is already in use.']]);
            }

            // The old subdomain-of rule only looked at **other users'** domains
            // (User\DomainController::check, packages/api/app/Http/Controllers/
            // User/DomainController.php:411-423: Domain::where('user_id','<>',
            // $service->user_id)), so a domain below one the asking user owns is
            // fine. It also excluded the plan/server onboarding base domains via
            // array_diff($domains, $onboardingDomains); those are the Engine's
            // allocated bases and normally not project domains, so the mirror
            // rarely carries one – `isAllocatedBase()` below keeps a platform row
            // out of the rule all the same.
            if (isset($visible[$known])) {
                continue;
            }

            if (! str_ends_with($name, '.'.$known)) {
                continue;
            }

            // Only consult the Engine's base domains when the rule would fire:
            // a subdomain of a domain the user cannot see. The allocated base is
            // never a project domain, so a fresh domain makes no Engine call.
            if ($this->isAllocatedBase($known)) {
                continue;
            }

            throw ValidationException::withMessages(['domain' => ['Domain name is not available.']]);
        }
    }

    /**
     * Whether the known domain is one of the Engines' allocated base domains
     * (`sites_base_domain`): the old panel removed the plan/server onboarding
     * domains from the subdomain-of list before testing
     * (`array_diff($domains, $onboardingDomains)`, User\DomainController.php:
     * 406-410). Those bases are normally not project domains, so this is only
     * consulted for a domain the asking user cannot see. A failed read fails
     * **closed**: it degrades to "not a base", so the name is refused instead of
     * accepted, and the check never turns a typing request into a 503.
     *
     * Every Engine has its own bases (Multi): each is read; with
     * more than one Engine, one whose breaker is open is skipped without a call
     * (its bases count as "not a base", the fail-closed answer).
     */
    private function isAllocatedBase(string $known): bool
    {
        $engineIds = $this->engines->engineIds();
        $multi = count($engineIds) > 1;
        foreach ($engineIds as $engineId) {
            if ($multi && $this->health->isDown($engineId)) {
                continue;
            }

            try {
                $info = (new SystemApi($this->engines->forEngine($engineId)))->info();
            } catch (EngineException $e) {
                report($e);

                continue;
            }

            foreach (SystemApi::subdomainBasesFrom($info, '') as $base) {
                if ($known === $this->normalize($base)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * The application one of the user's known domains belongs to. The controller
     * passes it to `resolves()`/`addressFor()` so the probe targets that
     * project's own IP, not the shared Engine host.
     *
     * @param  Collection<int, Application>  $applications
     */
    public function ownerOf(string $domain, Collection $applications): ?Application
    {
        $name = $this->normalize($domain);

        return $applications->first(
            fn (Application $application): bool => $this->normalize((string) $application->domain) === $name,
        );
    }

    /**
     * Validate a domain name (no IP literals) and require it to be one of the
     * user's own domains; returns the normalized name.
     *
     * @param  list<string>  $knownDomains
     *
     * @throws ValidationException
     */
    public function assertKnownDomain(string $domain, array $knownDomains): string
    {
        $name = $this->normalize($domain);
        if (! $this->isValidName($name)) {
            throw ValidationException::withMessages(['domain' => ['Invalid domain name.']]);
        }

        // Scoped to the user's applications.
        if (! in_array($name, array_map(fn (string $d) => $this->normalize($d), $knownDomains), true)) {
            throw ValidationException::withMessages(['domain' => ['Domain name is not available.']]);
        }

        return $name;
    }

    private function isValidName(string $name): bool
    {
        return $name !== ''
            && preg_match('/^(?!:\/\/)(?=.{1,255}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i', $name) === 1;
    }

    private function normalize(string $domain): string
    {
        $name = strtolower(trim($domain));
        if (str_starts_with($name, 'www.')) {
            $name = substr($name, 4);
        }

        return $name;
    }
}
