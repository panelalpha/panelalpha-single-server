<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine application-user endpoints for one project.
 * Containers only; the Engine returns bare `{data}` or 204.
 */
final class AppUsersApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function users(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('app/users'))->json('data'));
    }

    /**
     * Role names the app accepts (Engine `GET app/roles` → `data: string[]`;
     * old `Users::listRoles()` declared `array<string>`).
     *
     * @return list<string>
     */
    public function roles(EngineProject $project): array
    {
        return Payload::strings($this->engine->get($project->enginePath('app/roles'))->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params  {login, email, password, role}
     */
    public function createUser(EngineProject $project, array $params): Response
    {
        return $this->engine->post($project->enginePath('app/users'), $params);
    }

    public function deleteUser(EngineProject $project, string $userId): Response
    {
        return $this->engine->delete($project->enginePath('app/users/'.rawurlencode($userId)));
    }

    public function resetPassword(EngineProject $project, string $userId, string $password): Response
    {
        return $this->engine->put($project->enginePath('app/users/'.rawurlencode($userId).'/password'), [
            'password' => $password,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function sso(EngineProject $project, string $userId): array
    {
        return Payload::object($this->engine->post($project->enginePath('app/users/'.rawurlencode($userId).'/sso'))->json());
    }
}
