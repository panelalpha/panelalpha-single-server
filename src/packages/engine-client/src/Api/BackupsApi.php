<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * The Engine's backup endpoints:
 * project backups, their items, the download stream, the backup containers and
 * the one automatic-backup schedule.
 *
 * Engine: core/app/Http/Controllers/User/BackupController.php:53 (index),
 * :105 (store), :162 (show), :211 (restore), :268 (destroy), :302 (download);
 * core/app/Http/Controllers/User/BackupScheduleController.php:32 (show),
 * :67 (update), :102 (destroy); core/app/Http/Controllers/BackupContainerController.php:35
 * (index), :79 (store), :122 (update), :194 (destroy), :251 (test). Routes:
 * core/routes/api.php:182-191, :322, the container writes :333-337.
 */
final class BackupsApi
{
    public function __construct(private readonly EngineClient $engine) {}

    /**
     * The Engine's backup containers (global, not per project), ordered by name.
     * A container's `default` flag marks the store a client that chooses none
     * should use; an Engine before 2.3 sends no such key.
     *
     * @return list<array<string, mixed>>
     */
    public function containers(): array
    {
        return Payload::objects($this->engine->get('backup-containers')->json('data'));
    }

    /**
     * Create a backup container (Engine `POST /backup-containers`). `name` is
     * unique on the Engine; `credentials` are required for every driver but
     * `local` (S3: access_key_id, secret_access_key, region, endpoint,
     * use_path_style_endpoint; FTP/FTPS/SFTP: host, username, password, port,
     * and for SFTP private_key, passphrase). Answers the Engine's
     * `BackupContainerResource` (`id`, `name`, `driver`, `location`,
     * `default`, `has_credentials`, timestamps); a refused field is an Engine
     * 422.
     *
     * Engine: core/app/Http/Controllers/BackupContainerController.php:79 (store),
     * core/app/Http/Requests/BackupContainerStoreRequest.php:22-29.
     *
     * @param  array{name: string, driver: 'local'|'s3'|'ftp'|'ftps'|'sftp', location: string, credentials?: array<string, string|int|bool>|null}  $params
     * @return array<string, mixed>
     */
    public function createContainer(array $params): array
    {
        return Payload::object($this->engine->post('backup-containers', $params)->json('data'));
    }

    /**
     * Change a backup container (Engine `PUT /backup-containers/{id}`); only
     * the fields sent change, and sent `credentials` replace the stored ones.
     *
     * Engine: core/app/Http/Controllers/BackupContainerController.php:122 (update).
     *
     * @param  array{name?: string, driver?: 'local'|'s3'|'ftp'|'ftps'|'sftp', location?: string, credentials?: array<string, string|int|bool>|null}  $params
     * @return array<string, mixed>
     */
    public function updateContainer(int $id, array $params): array
    {
        return Payload::object($this->engine->put("backup-containers/{$id}", $params)->json('data'));
    }

    /**
     * Delete an empty backup container (Engine `DELETE /backup-containers/{id}`).
     * A container a schedule uses or that still holds backups is the Engine's
     * 409 with its message (`delete_backups` is never sent: the panel does not
     * remove a customer's backups with a container).
     *
     * Engine: core/app/Http/Controllers/BackupContainerController.php:194-216 (destroy).
     */
    public function deleteContainer(int $id): void
    {
        $this->engine->delete("backup-containers/{$id}");
    }

    /**
     * Write and remove a probe object in the container's storage (Engine
     * `POST /backup-containers/{id}/test`): `{data:{ok:true}}`, or the Engine's
     * 422 `{message}` with the storage's own error.
     *
     * Engine: core/app/Http/Controllers/BackupContainerController.php:251-264 (test).
     */
    public function testContainer(int $id): void
    {
        $this->engine->post("backup-containers/{$id}/test");
    }

    /**
     * A project's backups, newest first (Engine `BackupCollection` → `data`).
     *
     * @return list<array<string, mixed>>
     */
    public function list(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('backups'))->json('data'));
    }

    /**
     * Start a backup (Engine `POST /projects/{u}/backups`, 202). `container` is
     * the Engine container id or name; `files`/`databases` default to true.
     *
     * @param  array{container: string, files?: bool, databases?: bool, note?: string|null}  $params
     * @return array<string, mixed>
     */
    public function create(EngineProject $project, array $params): array
    {
        return Payload::object($this->engine->post($project->enginePath('backups'), $params)->json('data'));
    }

    /**
     * One backup (Engine `GET /projects/{u}/backups/{id}`).
     *
     * @return array<string, mixed>
     */
    public function show(EngineProject $project, int $id): array
    {
        return Payload::object($this->engine->get($project->enginePath("backups/{$id}"))->json('data'));
    }

    /**
     * Restore a backup (Engine `POST /projects/{u}/backups/{id}/restore`, 202).
     * `confirm` is always true; `only`/`exclude` narrow what is restored and
     * `delete_existing_files` swaps the home for the restored copy.
     *
     * @param  array{confirm: bool, only?: array<string, mixed>, exclude?: array<string, mixed>, delete_existing_files?: bool}  $params
     * @return array<string, mixed>
     */
    public function restore(EngineProject $project, int $id, array $params): array
    {
        return Payload::object($this->engine->post($project->enginePath("backups/{$id}/restore"), $params)->json('data'));
    }

    /**
     * Delete a backup (Engine `DELETE /projects/{u}/backups/{id}`, 202).
     *
     * @return array<string, mixed>
     */
    public function delete(EngineProject $project, int $id): array
    {
        return Payload::object($this->engine->delete($project->enginePath("backups/{$id}"))->json('data'));
    }

    /**
     * The stored backup item, streamed (Engine
     * `GET /projects/{u}/backups/{id}/items/{item}/download`). The response
     * carries the Engine status and the Range/Content headers; the caller copies
     * them.
     */
    public function download(EngineProject $project, int $id, int $item, ?string $range = null): Response
    {
        $options = [];
        if ($range !== null && $range !== '') {
            $options['headers'] = ['Range' => $range];
        }

        return $this->engine->stream('GET', $project->enginePath("backups/{$id}/items/{$item}/download"), $options);
    }

    /**
     * The project's automatic-backup schedule, or null when it has none
     * (Engine `GET /projects/{u}/backup-schedule`).
     *
     * @return array<string, mixed>|null
     */
    public function schedule(EngineProject $project): ?array
    {
        $data = Payload::object($this->engine->get($project->enginePath('backup-schedule'))->json('data'));

        return $data === [] ? null : $data;
    }

    /**
     * Create or replace the schedule (Engine `PUT /projects/{u}/backup-schedule`).
     *
     * @param  array{container: string, cron: string, keep_last?: int, files?: bool, databases?: bool, enabled?: bool}  $params
     * @return array<string, mixed>
     */
    public function updateSchedule(EngineProject $project, array $params): array
    {
        return Payload::object($this->engine->put($project->enginePath('backup-schedule'), $params)->json('data'));
    }

    /**
     * Remove the schedule (Engine `DELETE /projects/{u}/backup-schedule`, 204).
     */
    public function deleteSchedule(EngineProject $project): void
    {
        $this->engine->delete($project->enginePath('backup-schedule'));
    }
}
