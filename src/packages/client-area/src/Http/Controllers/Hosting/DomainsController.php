<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Hosting;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Hosting\ServerAccountService;
use PanelAlpha\ClientArea\Http\Requests\Hosting\DomainStoreRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\DomainUpdateRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\PhpSettingsRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\PhpVersionRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\SslCertificateRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\SslOrderRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\SslSettingsRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Support\QueryString;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;

/**
 * Domains, SSL, PHP version/settings and usage for one server account.
 * Backed by the Engine `E:/domains/*`, `E/php/*` and `E:/usage`.
 */
final class DomainsController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(private readonly ServerAccountService $service) {}

    public function index(Application $application): JsonResponse
    {
        return response()->json($this->service->domains($application));
    }

    public function store(DomainStoreRequest $request, Application $application): JsonResponse
    {
        $this->service->createDomain($application, $request->validated());

        return response()->json(['success' => true]);
    }

    public function update(DomainUpdateRequest $request, Application $application, string $domain): JsonResponse
    {
        $this->service->updateDomain($application, $domain, $request->validated());

        return response()->json(['success' => true]);
    }

    public function destroy(Application $application, string $domain): JsonResponse
    {
        $this->service->deleteDomain($application, $domain);

        return response()->json(['success' => true]);
    }

    /**
     * PUT /servers-accounts/{id}/domains/{domain}/set-as-primary – make the
     * domain the project's main domain (Engine main-domain rename).
     */
    public function setAsPrimary(Application $application, string $domain): JsonResponse
    {
        $this->service->setAsPrimaryDomain($application, $domain);

        return response()->json(['success' => true]);
    }

    /**
     * GET /ssl/certificate/installed?domain= – installed cert for the domain.
     */
    public function installedSslCert(Request $request, Application $application): JsonResponse
    {
        return response()->json($this->service->installedSslCert($application, QueryString::from($request, 'domain')));
    }

    /**
     * GET /ssl-offer – the SSL providers the CA can order from. Single-server
     * runs Let's Encrypt itself, so the list is a panel-side constant.
     */
    public function sslOffer(): JsonResponse
    {
        return response()->json(['data' => $this->service->sslOffer()]);
    }

    public function orderSslCert(SslOrderRequest $request, Application $application): JsonResponse
    {
        $this->service->requestSslCert($application, Payload::string($request->validated()['domain'] ?? ''));

        return response()->json(['success' => true]);
    }

    public function installSslCert(SslCertificateRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();
        $this->service->installSslCert($application, Payload::string($params['domain'] ?? ''), $params);

        return response()->json(['success' => true]);
    }

    /**
     * DELETE /ssl/certificates/installed?domain= – drops the certificate and
     * answers the one the domain carries now (the server's own, or the
     * configured issuer's).
     */
    public function removeSslCert(Request $request, Application $application): JsonResponse
    {
        return response()->json($this->service->removeSslCert($application, QueryString::from($request, 'domain')));
    }

    /**
     * GET/PUT /ssl/settings/{domain} – the forced-HTTPS toggle.
     */
    public function sslSettings(Request $request, Application $application, string $domain): JsonResponse
    {
        return response()->json($this->service->sslSettings($application, $domain, $this->authenticatedUser($request)));
    }

    public function setSslSettings(SslSettingsRequest $request, Application $application, string $domain): JsonResponse
    {
        $force = (bool) $request->validated()['force_https_redirect'];
        $this->service->setSslSettings($application, $domain, $force);

        return response()->json($this->service->sslSettings($application, $domain, $this->authenticatedUser($request)));
    }

    public function phpVersion(Application $application, string $domain): JsonResponse
    {
        return response()->json($this->service->phpVersion($application, $domain));
    }

    public function setPhpVersion(PhpVersionRequest $request, Application $application, string $domain): JsonResponse
    {
        $this->service->setPhpVersion($application, $domain, Payload::string($request->validated()['php_version'] ?? ''));

        return response()->json(['success' => true]);
    }

    public function phpVersions(Application $application): JsonResponse
    {
        return response()->json($this->service->phpVersions($application));
    }

    public function phpSettings(Application $application, string $domain): JsonResponse
    {
        return response()->json($this->service->phpSettings($application, $domain));
    }

    public function setPhpSettings(PhpSettingsRequest $request, Application $application, string $domain): JsonResponse
    {
        $this->service->setPhpSettings($application, $domain, $request->settings());

        return response()->json(['success' => true]);
    }

    public function usage(Application $application): JsonResponse
    {
        return response()->json($this->service->usage($application));
    }
}
