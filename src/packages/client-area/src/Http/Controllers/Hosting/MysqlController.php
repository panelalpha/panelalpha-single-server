<?php

namespace PanelAlpha\ClientArea\Http\Controllers\Hosting;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use PanelAlpha\ClientArea\Hosting\ServerAccountService;
use PanelAlpha\ClientArea\Http\Requests\Hosting\MysqlDatabaseDeleteRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\MysqlDatabaseRenameRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\MysqlDatabaseRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\MysqlPrivilegesRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\MysqlUpdateUserRequest;
use PanelAlpha\ClientArea\Http\Requests\Hosting\MysqlUserRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * MySQL hosting pages for one server account. `/server-accounts/{id}` uses the
 * same id as `/projects/{id}` in single-server mode, so the route binds
 * `{application}` and ownership is already checked.
 */
final class MysqlController extends Controller
{
    public function __construct(private readonly ServerAccountService $service) {}

    public function databases(Application $application): JsonResponse
    {
        return response()->json($this->service->databases($application));
    }

    public function createDatabase(MysqlDatabaseRequest $request, Application $application): JsonResponse
    {
        $this->service->createDatabase($application, Payload::string($request->validated()['name'] ?? ''));

        return response()->json(['success' => true]);
    }

    public function deleteDatabase(MysqlDatabaseDeleteRequest $request, Application $application, string $name): JsonResponse
    {
        $this->service->deleteDatabase($application, $name);

        return response()->json(['success' => true]);
    }

    public function renameDatabase(MysqlDatabaseRenameRequest $request, Application $application, string $name): JsonResponse
    {
        $this->service->renameDatabase($application, $name, Payload::string($request->validated()['name'] ?? ''));

        return response()->json(['success' => true]);
    }

    public function users(Application $application): JsonResponse
    {
        return response()->json($this->service->users($application));
    }

    public function createUser(MysqlUserRequest $request, Application $application): JsonResponse
    {
        $params = $request->validated();
        $this->service->createUser($application, Payload::string($params['name'] ?? ''), Payload::string($params['password'] ?? ''));

        return response()->json(['success' => true]);
    }

    public function updateUser(MysqlUpdateUserRequest $request, Application $application, string $name): JsonResponse
    {
        $this->service->updateUser($application, $name, $request->validated());

        return response()->json(['success' => true]);
    }

    public function deleteUser(Application $application, string $name): JsonResponse
    {
        $this->service->deleteUser($application, $name);

        return response()->json(['success' => true]);
    }

    public function privileges(Application $application, string $user, string $database): JsonResponse
    {
        return response()->json($this->service->privileges($application, $user, $database));
    }

    public function updatePrivileges(MysqlPrivilegesRequest $request, Application $application, string $user, string $database): JsonResponse
    {
        $this->service->updatePrivileges($application, $user, $database, Payload::string($request->validated()['privileges'] ?? ''));

        return response()->json(['success' => true]);
    }

    public function revokePrivileges(Application $application, string $user, string $database): JsonResponse
    {
        $this->service->revokePrivileges($application, $user, $database);

        return response()->json(['success' => true]);
    }

    public function serverInfo(Application $application): JsonResponse
    {
        return response()->json($this->service->serverInfo($application));
    }

    public function phpmyadminSso(Application $application): JsonResponse
    {
        return response()->json($this->service->phpmyadminSso($application));
    }
}
