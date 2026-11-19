<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\AtarimSettings;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\AtarimCollaborationLink;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * `GET /projects/{application}/collaboration-link`.
 *
 * Panel-side only: no Engine call. The old controller refused with a 422 when
 * the integration was disabled and returned the URL bare (`{url}`), which the
 * CA opens (`packages/client-area/src/mixins/CollaborationLinkMixin.js:12-15`).
 *
 * Moved from the host app (`App\Http\Controllers\CollaborationLinkController`)
 * into client-area-legacy and then into the controller.
 * The settings come from the host's `AtarimSettings` binding.
 */
final class CollaborationLinkController extends Controller
{
    /** Old `api/custom_validation.integration_disabled` text (key 0, brief §7.5). */
    private const INTEGRATION_DISABLED = 'Integration is disabled';

    public function __invoke(Request $request, Application $application, AtarimSettings $settings): JsonResponse
    {
        if (! $settings->enabled) {
            throw ValidationException::withMessages([self::INTEGRATION_DISABLED]);
        }

        $user = $request->user();

        if (! $user instanceof Model) {
            // The route is behind `auth`; this only keeps the types honest.
            abort(403);
        }

        return response()->json([
            'url' => AtarimCollaborationLink::url(
                $settings,
                $application->url(),
                Payload::string($user->getAttribute('email')),
                Payload::nullableString($user->getAttribute('first_name')),
                Payload::nullableString($user->getAttribute('last_name')),
            ),
        ]);
    }
}
