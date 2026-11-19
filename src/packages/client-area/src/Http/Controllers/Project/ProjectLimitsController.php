<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\ProjectLimits;
use PanelAlpha\ClientArea\Http\Requests\Project\UpdateProjectLimitsRequest;
use PanelAlpha\ClientArea\Models\Application;

/**
 * PUT /projects/{application}/limits – a client changes the six limits of one
 * project (project-usage). The edition's `ProjectLimits` saves them (Community sends
 * them to the Engine; the paid edition also checks the plan's ceilings) and
 * answers the project's fresh `resources` block.
 *
 * A route of this version only: the old panel let the admin change limits, not
 * the client. Guarded by `general.manage_limits`.
 */
final class ProjectLimitsController extends Controller
{
    public function __construct(private readonly ProjectLimits $limits) {}

    public function update(UpdateProjectLimitsRequest $request, Application $application): JsonResponse
    {
        // A staging copy has no limits of its own to change here.
        if ($application->isStaging()) {
            throw ValidationException::withMessages(['project' => [trans('client-area::general.limits_staging_refused')]]);
        }

        $values = $request->limits();
        $resources = $this->limits->update($application, $values);

        // A FormRequest copies the attribute bag, so set it on the canonical
        // request. Only the six numbers, no other input.
        request()->attributes->set('activity', [
            'App\\Models\\Application:'.$application->id => $values,
        ]);

        return response()->json(['data' => $resources]);
    }
}
