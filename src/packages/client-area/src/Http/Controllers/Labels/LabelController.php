<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Labels;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Http\Concerns\ResolvesAuthenticatedUser;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\ClientArea\Http\Presenters\LabelPresenter;
use PanelAlpha\ClientArea\Labels\LabelService;
use PanelAlpha\ClientArea\Models\Label;

/**
 * The user's project labels. Labels are panel-only; the
 * Engine knows nothing about them. Rules live in LabelService, shape in
 * LabelPresenter.
 *
 * Moved from the host app (`App\Http\Controllers\LabelController`) into
 * client-area-legacy (the host names no legacy class), and then into the
 * controller: labels are a Client Area feature.
 */
final class LabelController extends Controller
{
    use ResolvesAuthenticatedUser;

    public function __construct(
        private readonly LabelService $labels,
        private readonly LabelPresenter $presenter,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $labels = $this->labels->forUser($this->authenticatedUser($request))
            ->map(fn (Label $label) => $this->presenter->present($label))
            ->values()
            ->all();

        return response()->json(['data' => $labels]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'color' => ['required', 'regex:/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/'],
        ]);

        $label = $this->labels->create(
            $this->authenticatedUser($request),
            Payload::string($validated['title'] ?? ''),
            Payload::string($validated['color'] ?? ''),
        );

        // The old LabelResource shape under `data`.
        return response()->json(['data' => $this->presenter->present($label)]);
    }

    /**
     * DELETE /api/labels – delete by title (the CA identifies labels by title).
     */
    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
        ]);

        $this->labels->deleteByTitle($this->authenticatedUser($request), $validated['title']);

        return response()->json(['success' => true]);
    }
}
