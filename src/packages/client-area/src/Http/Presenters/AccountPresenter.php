<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use PanelAlpha\ClientArea\Support\Payload;

/**
 * Shapes Engine FTP / SFTP / cron rows the way the Client Area reads them.
 *
 * The CA's FTP table reads `diskused`/`diskquota` (`'unlimited'` or MB) and the
 * old collection sorted newest first; the Engine returns `details` with
 * `unlimited_quota`/`quota`.
 */
final class AccountPresenter
{
    /**
     * @param  array<string, mixed>  $account  Engine FtpAccountResource
     * @return array<string, mixed>
     */
    public function ftp(array $account): array
    {
        $details = Payload::object($account['details'] ?? null);
        $unlimited = (bool) ($details['unlimited_quota'] ?? false);

        return [
            'user' => $account['user'] ?? '',
            'directory' => $account['directory'] ?? '/',
            'diskused' => $account['disk_usage_mb'] ?? 0,
            'diskquota' => $unlimited ? 'unlimited' : (Payload::int($details['quota'] ?? null) ?? 0),
            'created_at' => $account['created_at'] ?? null,
            'updated_at' => $account['updated_at'] ?? null,
            'usage_quota' => null,
            'actions' => ['edit_password'],
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $accounts
     * @return list<array<string, mixed>>
     */
    public function ftpList(array $accounts): array
    {
        return array_map(fn (array $a) => $this->ftp($a), $accounts);
    }

    /**
     * @param  array<string, mixed>  $account  Engine SftpAccountResource
     * @return array<string, mixed>
     */
    public function sftp(array $account): array
    {
        return [
            'user' => $account['username'] ?? '',
            'username' => $account['username'] ?? '',
            'auth_method' => $account['auth_method'] ?? 'password',
            'created_at' => $account['created_at'] ?? null,
            'updated_at' => $account['updated_at'] ?? null,
            'actions' => ['edit_password'],
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $accounts
     * @return list<array<string, mixed>>
     */
    public function sftpList(array $accounts): array
    {
        return array_map(fn (array $a) => $this->sftp($a), $accounts);
    }

    /**
     * @param  array<string, mixed>  $job  Engine cron job array
     * @return array<string, mixed>
     */
    public function cron(array $job): array
    {
        // The CA builds its delete/update URL from `line` (the job's identity).
        // The Engine names it `hash`; surface both.
        $hash = Payload::string($job['hash'] ?? '');

        return [
            'hash' => $hash,
            'line' => $hash,
            'command' => $job['command'] ?? '',
            // The Compose service a container project's job runs in; null on
            // PHP hosting (Engine 2.3.0).
            'service' => isset($job['service']) && is_string($job['service']) ? $job['service'] : null,
            'minute' => $job['minute'] ?? '*',
            'hour' => $job['hour'] ?? '*',
            'day_of_month' => $job['day_of_month'] ?? '*',
            'month' => $job['month'] ?? '*',
            'day_of_week' => $job['day_of_week'] ?? '*',
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $jobs
     * @return list<array<string, mixed>>
     */
    public function cronList(array $jobs): array
    {
        return array_map(fn (array $j) => $this->cron($j), $jobs);
    }
}
