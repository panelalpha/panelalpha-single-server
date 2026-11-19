<?php

namespace App\Support;

/**
 * The signal sets `users.new_device_detection` accepts; the old panel's enum
 * values (packages/api/database/migrations/2014_10_12_000000_create_users_table
 * .php), which the CA sends verbatim.
 */
final class DeviceDetection
{
    /** @var list<string> */
    public const SIGNALS = [
        'ip, device, browser',
        'ip, device',
        'ip, browser',
        'device, browser',
        'ip',
        'device',
        'browser',
    ];

    public const DEFAULT = 'ip, device, browser';
}
