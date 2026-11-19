<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Hosting;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Hosting\ServerAccountService;
use PanelAlpha\ClientArea\Http\Requests\Hosting\CronJobRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FtpAccountStoreRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\FtpAccountUpdateRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\SftpAccessTypeRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\SftpAccountStoreRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\SftpAccountUpdateRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * FTP / SFTP / cron hosting pages for one server account,
 * backed by the Engine's `E:/ftp-accounts`, `E:/sftp-accounts` and `E:/cron-jobs`.
 */
final class AccountsController extends Controller
{
    public function __construct(private readonly ServerAccountService $service) {}

    // FTP -----------------------------------------------------------------

    public function ftpAccounts(Application $application): JsonResponse
    {
        return response()->json($this->service->ftpAccounts($application));
    }

    public function createFtpAccount(FtpAccountStoreRequest $request, Application $application): JsonResponse
    {
        $this->service->createFtpAccount($application, $request->validated());

        return response()->json(['success' => true]);
    }

    public function updateFtpAccount(FtpAccountUpdateRequest $request, Application $application, string $user): JsonResponse
    {
        $this->service->updateFtpAccount($application, $user, $request->validated());

        return response()->json(['success' => true]);
    }

    public function deleteFtpAccount(Application $application, string $user): JsonResponse
    {
        $this->service->deleteFtpAccount($application, $user);

        return response()->json(['success' => true]);
    }

    public function ftpServerInfo(Application $application): JsonResponse
    {
        return response()->json($this->service->ftpServerInfo($application));
    }

    // SFTP ----------------------------------------------------------------

    public function sftpAccounts(Application $application): JsonResponse
    {
        return response()->json($this->service->sftpAccounts($application));
    }

    public function createSftpAccount(SftpAccountStoreRequest $request, Application $application): JsonResponse
    {
        $this->service->createSftpAccount($application, $request->validated());

        return response()->json(['success' => true]);
    }

    public function updateSftpAccount(SftpAccountUpdateRequest $request, Application $application, string $user): JsonResponse
    {
        $this->service->updateSftpAccount($application, $user, $request->validated());

        return response()->json(['success' => true]);
    }

    public function deleteSftpAccount(Application $application, string $user): JsonResponse
    {
        $this->service->deleteSftpAccount($application, $user);

        return response()->json(['success' => true]);
    }

    public function sftpServerInfo(Application $application): JsonResponse
    {
        return response()->json($this->service->sftpServerInfo($application));
    }

    /**
     * POST /server-accounts/{id}/sftp-accounts/disconnect-all – ends every open
     * session through the Engine `sftp-accounts/kill-sessions` (since Engine
     * `29ae`). The old route's privilege is `hosting.manage_sftp`.
     */
    public function disconnectAllSftpSessions(Application $application): JsonResponse
    {
        $this->service->disconnectAllSftpSessions($application);

        return response()->json(['success' => true]);
    }

    /**
     * POST /server-accounts/{id}/sftp-accounts/set-access-type – refused: the
     * Engine has no per-account access type.
     */
    public function setSftpAccessType(SftpAccessTypeRequest $request, Application $application): JsonResponse
    {
        $this->service->setSftpAccessType($application, Payload::string($request->validated()['access_type'] ?? ''));

        return response()->json(['success' => true]);
    }

    // Cron ----------------------------------------------------------------

    public function cronJobs(Application $application): JsonResponse
    {
        return response()->json($this->service->cronJobs($application));
    }

    public function createCronJob(CronJobRequest $request, Application $application): JsonResponse
    {
        $this->service->createCronJob($application, $request->validated());

        return response()->json(['success' => true]);
    }

    public function updateCronJob(CronJobRequest $request, Application $application, string $hash): JsonResponse
    {
        $this->service->updateCronJob($application, $hash, $request->validated());

        return response()->json(['success' => true]);
    }

    public function deleteCronJob(Application $application, string $hash): JsonResponse
    {
        $this->service->deleteCronJob($application, $hash);

        return response()->json(['success' => true]);
    }
}
