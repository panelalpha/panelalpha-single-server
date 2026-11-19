<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine FTP / SFTP account and cron-job endpoints for one project (migration
 * section L). Thin and stateless; all Engine paths for this area live here.
 */
final class AccountsApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function ftpAccounts(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('ftp-accounts'))->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function createFtpAccount(EngineProject $project, array $params): Response
    {
        return $this->engine->post($project->enginePath('ftp-accounts'), $params);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function updateFtpAccount(EngineProject $project, string $user, array $params): Response
    {
        return $this->engine->put($project->enginePath('ftp-accounts/'.rawurlencode($user)), $params);
    }

    public function deleteFtpAccount(EngineProject $project, string $user): Response
    {
        return $this->engine->delete($project->enginePath('ftp-accounts/'.rawurlencode($user)));
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function sftpAccounts(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('sftp-accounts'))->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function createSftpAccount(EngineProject $project, array $params): Response
    {
        return $this->engine->post($project->enginePath('sftp-accounts'), $params);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function updateSftpAccount(EngineProject $project, string $user, array $params): Response
    {
        return $this->engine->put($project->enginePath('sftp-accounts/'.rawurlencode($user)), $params);
    }

    public function deleteSftpAccount(EngineProject $project, string $user): Response
    {
        return $this->engine->delete($project->enginePath('sftp-accounts/'.rawurlencode($user)));
    }

    /**
     * End every open SFTP session of the project (Engine `sftp-accounts/kill-sessions`,
     * in the Engine since `29ae`): `core/app/Http/Controllers/User/SftpAccountController.php:269`
     * → `{data:{killed:int}}` (`System/Services/Sftp.php`). A project with no account
     * or no open session answers 0.
     *
     * @return array<string, mixed>
     */
    public function killSftpSessions(EngineProject $project): array
    {
        return Payload::object($this->engine->post($project->enginePath('sftp-accounts/kill-sessions'))->json('data'));
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function cronJobs(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('cron-jobs'))->json('data'));
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function createCronJob(EngineProject $project, array $params): Response
    {
        return $this->engine->post($project->enginePath('cron-jobs'), $params);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public function updateCronJob(EngineProject $project, string $hash, array $params): Response
    {
        return $this->engine->put($project->enginePath('cron-jobs/'.rawurlencode($hash)), $params);
    }

    public function deleteCronJob(EngineProject $project, string $hash): Response
    {
        return $this->engine->delete($project->enginePath('cron-jobs/'.rawurlencode($hash)));
    }
}
