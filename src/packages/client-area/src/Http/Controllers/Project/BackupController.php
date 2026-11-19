<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Project;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Symfony\Component\HttpFoundation\HeaderUtils;
use PanelAlpha\ClientArea\Http\Requests\Project\AutomaticBackupRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\BackupStoreRequest;
use PanelAlpha\ClientArea\Http\Requests\Project\RestoreBackupRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Hosting\BackupService;
use PanelAlpha\ClientArea\Support\Payload;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Project backups. The Engine owns the backup
 * rows and objects; the controller is thin and the service maps the old CA
 * shapes. The list and the automatic-backup read are unprivileged, as the old
 * routes were; the writes and the item download keep `wordpress.manage_backups`
 * and `wordpress.manage_auto_backup`.
 */
final class BackupController extends Controller
{
    public function __construct(private readonly BackupService $backups) {}

    /**
     * GET /projects/{application}/wordpress/backups – the backups table, plus
     * the `meta.usage` counts the CA cards read (`Backups.vue:269`).
     */
    public function index(Application $application): JsonResponse
    {
        return response()->json($this->backups->list($application));
    }

    /**
     * POST /projects/{application}/wordpress/backups – start a manual backup.
     */
    public function store(BackupStoreRequest $request, Application $application): JsonResponse
    {
        return response()->json($this->backups->create($application, $request->validated()));
    }

    /**
     * PUT /projects/{application}/wordpress/backups/{backupId}/restore.
     */
    public function restore(RestoreBackupRequest $request, Application $application, int $backupId): JsonResponse
    {
        $this->backups->restore($application, $backupId, $request->validated());

        return response()->json(['success' => true]);
    }

    /**
     * DELETE /projects/{application}/wordpress/backups/{backupId}.
     */
    public function destroy(Application $application, int $backupId): JsonResponse
    {
        $this->backups->delete($application, $backupId);

        return response()->json(['success' => true]);
    }

    /**
     * GET /projects/{application}/wordpress/backups/{backupId}/item/{itemId}/download
     * – the CA opens this URL by hand (`BackupActionsMixin.js:439`), so the body
     * is streamed with the Engine's status and Range headers.
     */
    public function download(Request $request, Application $application, int $backupId, int $itemId): StreamedResponse|JsonResponse
    {
        $range = $request->header('Range');
        $response = $this->backups->download($application, $backupId, $itemId, is_string($range) ? $range : null);

        // A refused read keeps its Engine status and message.
        if ($response->status() >= 400) {
            $message = Payload::nullableString($response->json('message'));

            return response()->json(['message' => $message ?? ''], $response->status());
        }

        $headers = [];
        foreach (['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges'] as $name) {
            $value = $response->header($name);
            if ($value !== '') {
                $headers[$name] = $value;
            }
        }

        $filename = "backup-{$backupId}-item-{$itemId}.gz";
        $headers['Content-Disposition'] = HeaderUtils::makeDisposition(
            HeaderUtils::DISPOSITION_ATTACHMENT,
            $filename,
            $filename,
        );

        $body = $response->toPsrResponse()->getBody();

        return response()->stream(function () use ($body): void {
            while (! $body->eof()) {
                echo $body->read(8192);
            }
        }, $response->status(), $headers);
    }

    /**
     * GET /projects/{application}/wordpress/automatic-backup – the old
     * `AutomaticBackupResource` shape, from the Engine's one schedule.
     */
    public function automaticBackup(Application $application): JsonResponse
    {
        return response()->json(['data' => $this->backups->automaticBackup($application)]);
    }

    /**
     * PUT /projects/{application}/wordpress/automatic-backup.
     */
    public function updateAutomaticBackup(AutomaticBackupRequest $request, Application $application): JsonResponse
    {
        $this->backups->updateAutomaticBackup($application, $request->validated());

        return response()->json(['success' => true]);
    }
}
