<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine MySQL endpoints for one project: databases,
 * users, privileges, server info and phpMyAdmin SSO.
 *
 * Thin and stateless; the Engine `data` is returned as arrays. All Engine paths
 * for this area live here.
 */
final class MysqlApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function databases(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('mysql/databases'))->json('data'));
    }

    public function createDatabase(EngineProject $project, string $name): Response
    {
        return $this->engine->post($project->enginePath('mysql/databases'), ['name' => $name]);
    }

    public function deleteDatabase(EngineProject $project, string $name): Response
    {
        return $this->engine->delete($project->enginePath('mysql/databases/'.rawurlencode($name)));
    }

    /**
     * Rename a database (Engine `mysql/databases/{dbname}/rename`, since Engine
     * `29ae`): `core/app/Http/Controllers/User/Mysql/DatabaseController.php:247`
     * → 202 TaskResource (`details.action = mysql_database_rename`, `from`, `to`).
     * The path `{dbname}` is the stored (prefixed) name; the body `name` is the
     * **unprefixed** new name and the Engine re-adds the project prefix
     * (`User::withMysqlPrefix`, idempotent). 422 `name_taken` / `reserved_name` /
     * `name_too_long` / `managed_database`, 409 while the project is busy.
     */
    public function renameDatabase(EngineProject $project, string $name, string $newName): Response
    {
        return $this->engine->put($project->enginePath('mysql/databases/'.rawurlencode($name).'/rename'), ['name' => $newName]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function users(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('mysql/users'))->json('data'));
    }

    public function createUser(EngineProject $project, string $name, string $password): Response
    {
        return $this->engine->post($project->enginePath('mysql/users'), [
            'name' => $name,
            'password' => $password,
        ]);
    }

    public function deleteUser(EngineProject $project, string $name): Response
    {
        return $this->engine->delete($project->enginePath('mysql/users/'.rawurlencode($name)));
    }

    public function renameUser(EngineProject $project, string $name, string $newName): Response
    {
        return $this->engine->put($project->enginePath('mysql/users/'.rawurlencode($name).'/rename'), ['name' => $newName]);
    }

    public function changeUserPassword(EngineProject $project, string $name, string $password): Response
    {
        return $this->engine->put($project->enginePath('mysql/users/'.rawurlencode($name).'/change-password'), [
            'password' => $password,
        ]);
    }

    /**
     * @return array<string, mixed>|string the privilege preset / raw list
     */
    public function privileges(EngineProject $project, string $user, string $database): array|string
    {
        return Payload::arrayOrString($this->engine->get($project->enginePath('mysql/privileges/'.rawurlencode($user).'/'.rawurlencode($database)))->json('data'));
    }

    public function updatePrivileges(EngineProject $project, string $user, string $database, string $privileges): Response
    {
        return $this->engine->put($project->enginePath('mysql/privileges/'.rawurlencode($user).'/'.rawurlencode($database)), [
            'privileges' => $privileges,
        ]);
    }

    public function revokePrivileges(EngineProject $project, string $user, string $database): Response
    {
        return $this->engine->delete($project->enginePath('mysql/privileges/'.rawurlencode($user).'/'.rawurlencode($database)));
    }

    /**
     * @return array<string, mixed>
     */
    public function serverInfo(EngineProject $project): array
    {
        return Payload::object($this->engine->get($project->enginePath('mysql/server-info'))->json('data'));
    }

    /**
     * A single-use phpMyAdmin login token URL.
     *
     * @return array<string, mixed>
     */
    public function phpmyadminSsoToken(EngineProject $project): array
    {
        return Payload::object($this->engine->post($project->enginePath('mysql/phpmyadmin-sso-token'))->json('data'));
    }
}
