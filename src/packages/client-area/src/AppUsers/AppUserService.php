<?php

namespace PanelAlpha\ClientArea\AppUsers;

use PanelAlpha\EngineClient\Api\AppUsersApi;
use PanelAlpha\ClientArea\Models\Application;

/**
 * Application users of a container project, backed by the Engine `E:/app/*`
 * endpoints. Every Engine call goes through AppUsersApi here.
 */
final class AppUserService
{
    /**
     * @return list<array<string, mixed>>
     */
    public function users(Application $application): array
    {
        return (new AppUsersApi($application->engine()))->users($application->engineProject());
    }

    /**
     * @return list<string>
     */
    public function roles(Application $application): array
    {
        return (new AppUsersApi($application->engine()))->roles($application->engineProject());
    }

    /**
     * @param  array{username: string, email: string, password: string, role: string}  $params
     */
    public function create(Application $application, array $params): void
    {
        (new AppUsersApi($application->engine()))->createUser($application->engineProject(), [
            'login' => $params['username'],
            'email' => $params['email'],
            'password' => $params['password'],
            'role' => $params['role'],
        ]);
    }

    public function delete(Application $application, string $userId): void
    {
        (new AppUsersApi($application->engine()))->deleteUser($application->engineProject(), $userId);
    }

    public function resetPassword(Application $application, string $userId, string $password): void
    {
        (new AppUsersApi($application->engine()))->resetPassword($application->engineProject(), $userId, $password);
    }

    /**
     * @return array<string, mixed>
     */
    public function ssoUrl(Application $application, string $userId): array
    {
        return (new AppUsersApi($application->engine()))->sso($application->engineProject(), $userId);
    }
}
