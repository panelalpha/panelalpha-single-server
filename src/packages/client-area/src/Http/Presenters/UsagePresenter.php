<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use PanelAlpha\ClientArea\Support\Payload;

/**
 * Shapes the Engine `E:/usage` summary the way the CA reads it (old
 * `ServerAccountController::usage`).
 *
 * The Engine calls disk usage `storage`; the CA reads `disk_usage`. Every
 * metric the old panel returned is present, with `{usage: 0, maximum: null}`
 * when the Engine has none (placeholders, never missing keys).
 */
final class UsagePresenter
{
    /**
     * The metrics the old panel always returned.
     *
     * @var list<string>
     */
    private const METRICS = [
        'instances',
        'disk_usage',
        'bandwidth',
        'addon_domains',
        'subdomains',
        'aliases',
        'email_accounts',
        'mailing_lists',
        'autoresponders',
        'forwarders',
        'email_filters',
        'ftp_accounts',
        'sftp_accounts',
        'mysql_databases',
    ];

    /**
     * Engine MB → the CA's bytes; `-1` and null mean unlimited (null).
     */
    private function megabytesToBytes(mixed $value): ?int
    {
        $megabytes = Payload::limit($value);

        return $megabytes === null ? null : $megabytes * 1024 * 1024;
    }

    /**
     * @param  array<string, mixed>  $usage  Engine `E:/usage` body (bare JSON)
     * @return array{data: array<string, mixed>, supported_metrics: array<string, bool>}
     */
    public function present(array $usage): array
    {
        // Engine `storage` is the CA's `disk_usage` in **MB**, with `-1`
        // unlimited (Lib/Usage/ProjectUsage.php:44-46, FileManager::diskUsage()
        // `du -sm`, User::getRealFtpAccountQuota()); the CA reads bytes and
        // null for unlimited (old PanelAlpha/Account.php:385-391, U6c).
        if (array_key_exists('storage', $usage)) {
            /** @var mixed $rawStorage */
            $rawStorage = $usage['storage'] ?? null;
            $storage = is_array($rawStorage) ? $rawStorage : [];
            $usage['disk_usage'] = [
                'usage' => $this->megabytesToBytes($storage['usage'] ?? null),
                'maximum' => $this->megabytesToBytes($storage['maximum'] ?? null),
            ];
        }

        // Engine-only keys the CA does not read.
        unset($usage['storage'], $usage['logs']);

        foreach (self::METRICS as $metric) {
            if (! array_key_exists($metric, $usage)) {
                $usage[$metric] = ['usage' => 0, 'maximum' => null];
            }
        }

        // Every Engine maximum is -1 when unlimited since Engine 2.2.0
        // (`ResourceLimit::UNLIMITED`; bandwidth was -1048576); the CA shows
        // `∞` only for null (`Payload::limit()`).
        foreach (array_keys($usage) as $metric) {
            /** @var mixed $value */
            $value = $usage[$metric];
            if (is_array($value) && array_key_exists('maximum', $value)) {
                $value['maximum'] = Payload::limit($value['maximum']);
                $usage[$metric] = $value;
            }
        }

        return [
            'data' => $usage,
            'supported_metrics' => [
                'bandwidth' => true,
                'addon_domains' => true,
                'subdomains' => true,
                // No aliases, e-mail server or e-mail storage on the Engine.
                'aliases' => false,
                'email_accounts' => false,
                'email_storage' => false,
                'ftp_accounts' => true,
                'sftp_accounts' => true,
                'mysql_databases' => true,
            ],
        ];
    }
}
