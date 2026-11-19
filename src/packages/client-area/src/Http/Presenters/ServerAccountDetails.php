<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use PanelAlpha\ClientArea\Support\Payload;

/**
 * The account fields the Client Area copies from `details` (homedir,
 * mysql_db_prefix, ip_address, mysql_php_my_admin_sso_host), derived once for
 * the service and the project payloads. Each caller passes its own IPv4 list
 * (filtered or not) and the project's own domain.
 */
final class ServerAccountDetails
{
    /**
     * @param  array<string, mixed>  $config  raw Engine config
     * @param  array<string, mixed>  $rawDetails  raw Engine details
     * @param  list<string>  $ipv4
     * @return array{homedir: string, mysql_db_prefix: string, ip_address: string, mysql_php_my_admin_sso_host: string}
     */
    public static function derive(array $config, array $rawDetails, array $ipv4, string $engineUsername, ?string $domain = null): array
    {
        return [
            'homedir' => Payload::nullableString($config['home_dir'] ?? null)
                ?? Payload::nullableString($rawDetails['home_dir'] ?? null)
                ?? '/home/'.$engineUsername,
            'mysql_db_prefix' => Payload::nullableString($config['mysql_prefix'] ?? null)
                ?? Payload::nullableString($rawDetails['mysql_prefix'] ?? null)
                ?? '',
            'ip_address' => $ipv4[0] ?? (Payload::nullableString($rawDetails['ip_address'] ?? null) ?? ''),
            // The phpMyAdmin SSO flow warns when this host has no A record. A
            // panelalpha account has no SSO host of its own; the project's
            // domain is where the SSO url opens, so that is the one to check.
            'mysql_php_my_admin_sso_host' => Payload::nullableString($rawDetails['mysql_php_my_admin_sso_host'] ?? null)
                ?? Payload::nullableString($domain)
                ?? '',
        ];
    }
}
