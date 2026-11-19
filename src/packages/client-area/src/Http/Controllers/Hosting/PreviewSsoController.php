<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Hosting;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Hosting\PreviewTunnelService;
use PanelAlpha\ClientArea\Http\Requests\Hosting\PhpmyadminPreviewSsoRequest;
use PanelAlpha\ClientArea\Models\Application;

/**
 * POST /server-accounts/{application}/mysql/phpmyadmin-preview-sso-url – the
 * phpMyAdmin preview SSO, served through the
 * project's Engine preview tunnel.
 */
final class PreviewSsoController extends Controller
{
    public function __construct(private readonly PreviewTunnelService $tunnels) {}

    public function phpmyadminPreviewSso(PhpmyadminPreviewSsoRequest $request, Application $application): JsonResponse
    {
        return response()->json($this->tunnels->phpmyadminPreviewSso($application));
    }
}
