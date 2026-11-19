<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ScreenshotService;

/**
 * Website screenshot for a project: refresh it, serve the
 * base64 payload and serve the JPG the Client Area embeds in project cards.
 *
 * The CA builds `screenshot.jpg` by hand, so an `/instances/...` alias exists;
 * it appends `?time=<screenshot_time>` as a cache-buster.
 */
final class ScreenshotController extends Controller
{
    public function __construct(private readonly ScreenshotService $screenshots) {}

    /**
     * GET /projects/{application}/screenshot – base64 of the stored image.
     */
    public function show(Application $application): \Illuminate\Http\JsonResponse
    {
        $jpg = $this->screenshots->jpg($application);

        return response()->json(['base64' => $jpg === null ? null : base64_encode($jpg)]);
    }

    /**
     * GET /projects/{application}/screenshot.jpg – the stored JPG, or a 1×1 GIF
     * placeholder so the CA never shows a broken image (old screenshotJpg).
     */
    public function jpg(Application $application): Response
    {
        $jpg = $this->screenshots->jpg($application);

        if ($jpg === null) {
            // 1x1 transparent GIF, exactly as the old panel.
            $gif = (string) hex2bin('4749463839610100010000000021f90401000000002c00000000010001000002010000');

            return response($gif, 200, [
                'Content-Type' => 'image/gif',
                'Cache-Control' => 'private, max-age=604800',
            ]);
        }

        return response($jpg, 200, [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'private, max-age=604800',
        ]);
    }

    /**
     * POST /projects/{application}/refresh-thumbnail – ask the Engine's
     * Lighthouse endpoint for a fresh report and store its screenshot. 422 when
     * the Engine cannot produce one (old ThumbnailController).
     */
    public function refresh(Application $application): \Illuminate\Http\JsonResponse
    {
        if (! $this->screenshots->refresh($application)) {
            return response()->json(['message' => 'The screenshot is currently unavailable.'], 422);
        }

        return response()->json(['success' => true]);
    }
}
