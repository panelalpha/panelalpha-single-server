<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Hosting;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Contracts\ApplicationRepository;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\QueryString;
use PanelAlpha\ClientArea\Contracts\ServiceDirectory;
use PanelAlpha\ClientArea\Hosting\DomainProbe;

/**
 * The panel-side domain/certificate probe routes,
 * split out of `DomainsController`, `ServiceDomainController` and
 * `OnboardingController` and moved to legacy with the probe.
 * Every route keeps its original path, privilege and throttle.
 *
 * Permanent panel code: every certificate read goes through the Engine's
 * `ssl-check` and the reachability probe stays panel-side, so it moved from
 * client-area-legacy into the controller. The route names follow the package
 * (`client-area.*`).
 */
final class DomainProbeController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(
        private readonly DomainProbe $probe,
        private readonly ApplicationRepository $applications,
    ) {}

    /**
     * GET /projects/onboarding/ssl-certificate?domain= – what the domain
     * serves (Engine `ssl-check`). The old panel answered the two keys at the
     * **top level** of the body (the CA reads `response.data.is_ssl_certificate_detected`,
     * i.e. the body itself: SuperQuickOnboardingMixin.js:72-74). The name is
     * validated (no IP literals) and scoped to the user's domains.
     */
    public function detectedSslCertificate(Request $request): JsonResponse
    {
        $domain = QueryString::from($request, 'domain');

        // The reader only sees the mirror - no Engine sync on a polling route.
        $applications = $this->applications->forUser($this->authenticatedUser($request), refresh: false);
        /** @var list<string> $known */
        $known = collect($applications)
            ->map(fn (Application $application) => (string) ($application->domain ?? ''))
            ->filter()
            ->values()
            ->all();

        $name = $this->probe->assertKnownDomain($domain, $known);
        // What the domain serves, checked by the owning project's Engine.
        $certificate = $this->probe->certificate($name, $this->probe->ownerOf($domain, $applications));

        return response()->json([
            'is_ssl_certificate_detected' => $certificate !== null,
            'ssl_certificate' => $certificate,
        ]);
    }

    /**
     * GET /services/{id}/domains/resolve?domain= – whether the domain resolves
     * to the Engine. The CA only needs a boolean.
     */
    public function resolve(Request $request, int $service): JsonResponse
    {
        abort_if(app(ServiceDirectory::class)->findForUser($this->authenticatedUser($request), $service) === null, 404);

        // A CA polling route: read the mirror, never sync.
        $applications = $this->applications->forUser($this->authenticatedUser($request), refresh: false);
        /** @var list<string> $known */
        $known = collect($applications)
            ->map(fn (Application $application) => (string) $application->domain)
            ->filter()
            ->values()
            ->all();

        $domain = QueryString::from($request, 'domain');
        $owner = $this->probe->ownerOf($domain, $applications);

        return response()->json(['is_resolved' => $this->probe->resolves($domain, $known, $owner)]);
    }

    /**
     * GET /ssl/certificate/detected?domain= – the certificate one of the
     * project's domains really serves (Engine `ssl-check`), with its verdict.
     */
    public function detectedSslCert(Request $request, Application $application): JsonResponse
    {
        return response()->json(['data' => $this->probe->certificateForDomain($application, QueryString::from($request, 'domain'))]);
    }
}
