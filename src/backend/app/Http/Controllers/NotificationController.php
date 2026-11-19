<?php

namespace App\Http\Controllers;

use App\Http\Presenters\Account\NotificationPresenter;
use App\Models\User;
use App\Services\Notifications\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;

/**
 * Client Area notification bell (section B). Filtering lives in
 * NotificationService, the row shape in NotificationPresenter.
 */
class NotificationController extends Controller
{
    public function __construct(
        private readonly NotificationService $notifications,
        private readonly NotificationPresenter $presenter,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        /** @var User $user */
        $user = $this->authenticatedUser($request);
        // The CA computes `page = length / 10 + 1`, so the default page size is
        // 10.
        $notifications = $this->notifications->paginate($user, (int) ($validated['per_page'] ?? 10));

        return response()->json([
            'data' => collect($notifications->items())
                ->map(fn (DatabaseNotification $notification) => $this->presenter->present($notification))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $notifications->currentPage(),
                'last_page' => $notifications->lastPage(),
                'per_page' => $notifications->perPage(),
                'total' => $notifications->total(),
            ],
        ]);
    }

    /**
     * DELETE /api/notifications/{id}
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->notifications->delete($this->authenticatedUser($request), $id);

        return response()->json(['success' => true]);
    }

    /**
     * PUT /api/notifications/mark-as-read – all unread up to `read_at` (default now).
     */
    public function markAsRead(Request $request): JsonResponse
    {
        // `read_at` was an unvalidated value; it is a date.
        $validated = $request->validate(['read_at' => ['nullable', 'date']]);

        // The CA sends an ISO-8601 string; parse it so the comparison and the
        // stored value use the column's datetime format on every driver (S4b).
        $this->notifications->markAsRead($this->authenticatedUser($request), Carbon::parse($validated['read_at'] ?? now()));

        return response()->json(['success' => true]);
    }

    /**
     * DELETE /api/notifications – delete all up to `delete_at` (default now).
     */
    public function clear(Request $request): JsonResponse
    {
        $validated = $request->validate(['delete_at' => ['nullable', 'date']]);

        // Same ISO-8601 normalisation as mark-as-read (S4b).
        $this->notifications->clear($this->authenticatedUser($request), Carbon::parse($validated['delete_at'] ?? now()));

        return response()->json(['success' => true]);
    }
}
