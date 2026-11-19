<?php

namespace App\Services\Account;

/**
 * One row of the Client Area device list: a live session (from the `sessions`
 * table) joined to the remembered device fingerprint. Immutable so the
 * controller only formats it.
 */
final readonly class DeviceView
{
    public function __construct(
        public ?int $deviceId,
        public ?string $sessionId,
        public ?string $ipAddress,
        public ?string $browser,
        public ?string $device,
        public ?string $lastLogin,
        public bool $current,
    ) {}
}
