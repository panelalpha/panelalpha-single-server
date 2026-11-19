<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Http\Requests\Project\ProjectLabelRequest;
use PanelAlpha\ClientArea\Labels\LabelService;

/**
 * Assign/unassign a label on one project (the old panel's
 * POST/DELETE /projects/{id}/labels). Both identify the label by title and
 * delegate the rules to LabelService.
 */
final class ProjectLabelController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(private readonly LabelService $labels) {}

    public function assign(ProjectLabelRequest $request, Application $application): JsonResponse
    {
        $validated = $request->validated();

        $label = $this->labels->assign($application, $this->authenticatedUser($request), Payload::string($validated['title'] ?? ''));

        // The CA renders `payload["…Label:<id>"]`. A FormRequest
        // copies the attribute bag, so set it on the canonical request.
        request()->attributes->set('activity', [
            'App\\Models\\Label:'.$label->id => ['title' => $label->title, 'color' => $label->color],
        ]);

        return response()->json(['success' => true]);
    }

    public function unassign(ProjectLabelRequest $request, Application $application): JsonResponse
    {
        $validated = $request->validated();

        $row = $this->labels->unassign($application, Payload::string($validated['title'] ?? ''));

        request()->attributes->set('activity', [
            'App\\Models\\Label:'.($row->label_id ?? '') => ['title' => $row->title, 'color' => $row->color],
        ]);

        return response()->json(['success' => true]);
    }
}
