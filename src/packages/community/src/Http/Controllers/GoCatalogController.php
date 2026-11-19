<?php

namespace PanelAlpha\Community\Http\Controllers;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use PanelAlpha\Hub\Go\GoCatalog;
use PanelAlpha\Hub\Go\GoNotConnected;
use PanelAlpha\Hub\Go\GoUnavailable;
use PanelAlpha\Hub\HubPairing;

/**
 * The Client Area's PanelAlpha Go source: PanelAlpha Go's
 * verified apps, read with the Hub token on the server. The browser never sees
 * the token; it installs an app through the usual git onboarding
 * (`POST /projects/deploy`) with the `install` of `apps/{slug}`.
 *
 * A panel that is not paired answers 409 `hub_not_connected`; Go or the Hub
 * being down answers `go_unavailable` (503, or Go's 404 / 429).
 */
class GoCatalogController extends Controller
{
    public function __construct(private readonly GoCatalog $catalog) {}

    /**
     * `GET /api/community/go`: whether the catalog can be read, and the plan.
     */
    public function status(HubPairing $pairing): JsonResponse
    {
        if (! $pairing->isPaired()) {
            return response()->json(['connected' => false, 'available' => false]);
        }

        try {
            $me = $this->catalog->me();
        } catch (GoNotConnected) {
            return response()->json(['connected' => false, 'available' => false]);
        } catch (GoUnavailable) {
            return response()->json(['connected' => true, 'available' => false]);
        }

        return response()->json([
            'connected' => true,
            'available' => true,
            'plan' => $me['plan'] ?? null,
            'entitlements' => $me['entitlements'] ?? null,
        ]);
    }

    public function apps(Request $request): JsonResponse
    {
        $data = Validator::make($request->query(), [
            'q' => ['nullable', 'string', 'max:200'],
            'category' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'string', Rule::in(GoCatalog::SORTS)],
            'page' => ['integer', 'min:1', 'max:1000'],
            'per_page' => ['integer', 'min:1', 'max:100'],
        ])->validate();

        return $this->answer(fn (): array => $this->catalog->apps(
            self::text($data['q'] ?? null),
            self::text($data['category'] ?? null),
            (int) ($data['page'] ?? 1),
            (int) ($data['per_page'] ?? 24),
            self::text($data['sort'] ?? null),
        ));
    }

    public function search(Request $request): JsonResponse
    {
        $data = Validator::make($request->query(), [
            'q' => ['required', 'string', 'min:2', 'max:200'],
            'category' => ['nullable', 'string', 'max:100'],
            'limit' => ['integer', 'min:1', 'max:50'],
        ])->validate();

        return $this->answer(fn (): array => $this->catalog->search(
            (string) self::text($data['q']),
            self::text($data['category'] ?? null),
            (int) ($data['limit'] ?? 10),
        ));
    }

    public function categories(): JsonResponse
    {
        return $this->answer(fn (): array => ['data' => $this->catalog->categories()]);
    }

    public function show(string $slug): JsonResponse
    {
        abort_unless(preg_match('/^[a-z0-9][a-z0-9._-]{0,190}$/i', $slug) === 1, 404);

        return $this->answer(fn (): array => ['data' => $this->catalog->app($slug)]);
    }

    /**
     * @param  Closure(): array<string, mixed>  $read
     */
    private function answer(Closure $read): JsonResponse
    {
        try {
            return response()->json($read());
        } catch (GoNotConnected $e) {
            return response()->json(['message' => $e->getMessage(), 'reason' => 'hub_not_connected'], 409);
        } catch (GoUnavailable $e) {
            $status = in_array($e->status, [404, 429], true) ? $e->status : 503;

            return response()->json(['message' => $e->getMessage(), 'reason' => 'go_unavailable'], $status);
        }
    }

    private static function text(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        $value = trim($value);

        return $value === '' ? null : $value;
    }
}
