<?php

namespace PanelAlpha\Community\Http\Controllers;

use Illuminate\Contracts\Container\Container;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\ClientArea\Contracts\PanelLanguages;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Support\DateFormats;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\SystemApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\Hub\HubPairing;
use PanelAlpha\Community\Http\Requests\SettingsRequest;
use PanelAlpha\Community\Http\Requests\SettingsUrlRequest;
use PanelAlpha\Community\Settings\PanelAddressMove;

/**
 * Read and write of the three basic panel settings for the signed-in owner,
 * the panel's URL and the Engine's sites base domain.
 */
class SettingsController extends Controller
{
    private const string DEFAULT_NAME = 'My Server';

    private const string DEFAULT_LANGUAGE = 'en';

    public function show(Container $container, PanelSettings $settings, PanelLanguages $languages, PanelUrl $panelUrl): JsonResponse
    {
        $this->gate($container);

        return response()->json($this->payload($settings, $languages, $panelUrl));
    }

    public function update(
        Request $request,
        Container $container,
        PanelSettings $settings,
        PanelLanguages $languages,
        PanelUrl $panelUrl,
        EngineResolver $engines,
    ): JsonResponse {
        $this->gate($container);

        /** @var array{name: string, default_language: string, default_date_format: string, sites_base_domain?: ?string} $data */
        $data = Validator::make($request->all(), (new SettingsRequest)->rules($languages))->validate();

        // The whole General form in one request: a default domain sent here is saved like the dedicated route's, and
        // its refusal is the field error before anything else is stored.
        if (array_key_exists('sites_base_domain', $data)) {
            self::saveSitesBaseDomain(self::system($engines), $data['sites_base_domain']);
        }

        DB::transaction(function () use ($settings, $data): void {
            $settings->set('userapp.name', $data['name']);
            $settings->set('userapp.default-language', $data['default_language']);
            $settings->set('userapp.default-date-format', $data['default_date_format']);
        });

        return response()->json($this->payload($settings, $languages, $panelUrl));
    }

    /**
     * Save the panel's public URL. The panel is moved there on the Engine first
     *So a refusal leaves the stored URL and the address as they were;
     * `moved` says the old address no longer answers, so the browser goes to the
     * new one.
     */
    public function updateUrl(
        Request $request,
        Container $container,
        PanelSettings $settings,
        PanelAddressMove $address,
        HubPairing $hub,
    ): JsonResponse {
        $this->gate($container);

        /** @var array{url: string} $data */
        $data = Validator::make($request->all(), (new SettingsUrlRequest)->rules())->validate();
        $origin = SettingsUrlRequest::originOf($data['url']);

        $moved = $address->move(SettingsUrlRequest::hostOf($data['url']), SettingsUrlRequest::portOf($data['url']));

        DB::transaction(function () use ($settings, $hub, $origin): void {
            $settings->set('userapp.url', $origin);
            $hub->updateAdminUrl($origin);
        });

        // The Hub sends a Hub login to the reported address: tell it now, not at the next 5-minute report.
        if ($hub->isPaired()) {
            dispatch(static fn () => Artisan::call('hub:report'))->afterResponse();
        }

        return response()->json(['url' => $origin, 'moved' => $moved]);
    }

    /**
     * The domain the Engine names a project created without a domain of its
     * own under (`<project>.<domain>`), and
     * where such a project lands without it. Its own request, as it asks the
     * Engine: an outage leaves the other settings loading.
     */
    public function sitesBaseDomain(Container $container, EngineResolver $engines): JsonResponse
    {
        $this->gate($container);

        return response()->json(self::sitesBaseDomainOf(self::system($engines)->info()));
    }

    /**
     * An empty value clears it. The Engine refuses a name that cannot hold a
     * public certificate (its 422 `sites_base_domain`); projects that exist
     * keep their domain. Answers what GET answers, read after the change.
     */
    public function updateSitesBaseDomain(Request $request, Container $container, EngineResolver $engines): JsonResponse
    {
        $this->gate($container);

        $data = Validator::make($request->all(), [
            'sites_base_domain' => ['present', 'nullable', 'string', 'max:253'],
        ])->validate();

        $system = self::system($engines);
        self::saveSitesBaseDomain($system, $data['sites_base_domain'] ?? null);

        return response()->json(self::sitesBaseDomainOf($system->info()));
    }

    /**
     * An empty value clears it; the Engine refuses a name that cannot hold a
     * public certificate with its 422 on `sites_base_domain`.
     */
    private static function saveSitesBaseDomain(SystemApi $system, mixed $value): void
    {
        $system->updateSslConfig([
            'sites_base_domain' => trim(Payload::string($value)),
        ]);
    }

    private static function system(EngineResolver $engines): SystemApi
    {
        return new SystemApi($engines->forEngine($engines->defaultEngineId()));
    }

    /**
     * `project_domain_bases` is the Engine's naming ladder for a project
     * created with neither a domain nor a tunnel, best first (Engine
     * `DomainPlan::bases()`); null from an Engine that does not report it.
     *
     * @param  array<string, mixed>  $info  the Engine's `system/info`
     * @return array{sites_base_domain: ?string, project_domain_bases: list<array{base: string, source: string, suffixed: bool, publicly_resolvable: ?bool}>|null, certificate_issuer: ?string, shared_zone_issuance: bool, panelalpha_online_error: ?string}
     */
    private static function sitesBaseDomainOf(array $info): array
    {
        $domain = Payload::nullableString($info['sites_base_domain'] ?? null);

        $bases = null;
        if (is_array($info['project_domain_bases'] ?? null)) {
            $bases = [];
            foreach (Payload::objects($info['project_domain_bases']) as $base) {
                $name = Payload::string($base['base'] ?? null);
                if ($name !== '') {
                    $bases[] = [
                        'base' => $name,
                        'source' => Payload::string($base['source'] ?? null),
                        'suffixed' => Payload::bool($base['suffixed'] ?? null) ?? false,
                        'publicly_resolvable' => Payload::bool($base['publicly_resolvable'] ?? null),
                    ];
                }
            }
        }

        $certificates = Payload::object($info['sites_certificates'] ?? null);
        $onlineError = Payload::object(Payload::object($info['panelalpha_online'] ?? null)['last_error'] ?? null);

        return [
            'sites_base_domain' => $domain !== '' ? $domain : null,
            'project_domain_bases' => $bases,
            'certificate_issuer' => Payload::nullableString($certificates['issuer'] ?? null),
            'shared_zone_issuance' => Payload::bool($certificates['shared_zone_issuance'] ?? null) ?? false,
            'panelalpha_online_error' => Payload::nullableString($onlineError['message'] ?? null),
        ];
    }

    /**
     * Per request, not at route registration: the edition can change.
     */
    private function gate(Container $container): void
    {
        if (! SingleUserMode::active($container)) {
            abort(404);
        }
    }

    /**
     * The values agree with `/home`: a stored empty string falls back too.
     *
     * @return array{name: string, default_language: string, default_date_format: string, languages: list<string>, date_formats: list<string>, url: string}
     */
    private function payload(PanelSettings $settings, PanelLanguages $languages, PanelUrl $panelUrl): array
    {
        return [
            'name' => self::nonEmpty($settings->get('userapp.name'), self::DEFAULT_NAME),
            'default_language' => self::nonEmpty($settings->get('userapp.default-language'), self::DEFAULT_LANGUAGE),
            'default_date_format' => DateFormats::normalize($settings->get('userapp.default-date-format')),
            'languages' => $languages->codes(),
            'date_formats' => DateFormats::ALL,
            'url' => $panelUrl->base(),
        ];
    }

    private static function nonEmpty(?string $value, string $default): string
    {
        return $value !== null && $value !== '' ? $value : $default;
    }
}
