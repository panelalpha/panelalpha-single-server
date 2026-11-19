<?php

namespace App\Http\Presenters\Account;

use App\Services\Account\DeviceView;

/**
 * Shapes the device list the Client Area reads. Shaping lives here, not in the
 * controller.
 */
final class DevicePresenter
{
    /**
     * @return array<string, mixed>
     */
    public function present(DeviceView $device): array
    {
        return [
            'device_id' => $device->deviceId,
            'ip_address' => $device->ipAddress,
            'browser' => $device->browser,
            'device' => $device->device,
            'last_login' => $device->lastLogin,
            'current_device' => $device->current,
            'session_id' => $device->sessionId,
        ];
    }

    /**
     * @param  list<DeviceView>  $devices
     * @return list<array<string, mixed>>
     */
    public function presentList(array $devices): array
    {
        return array_map(fn (DeviceView $device): array => $this->present($device), $devices);
    }
}
