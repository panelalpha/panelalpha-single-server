<?php

namespace Tests\Browser\Helpers;

use App\Models\User;
use Tests\Browser\Support\DuskEnvironment;
use Tests\Browser\Support\PanelClient;

/**
 * Fixtures for the ported Client Area Dusk tests.
 *
 * The suite runs against a live, already-provisioned panel, so it never creates
 * a user or an instance itself: `setTestUser()` builds the in-memory user the
 * login page types in, and `getDevices()` replaces the old `Device` table read
 * with the panel's own `/api/user/devices` (marked `// Legacy:`).
 */
final class Helper
{
    public static function setTestUser(): User
    {
        $credentials = DuskEnvironment::user();
        $payload = PanelClient::instance()->home()['user'] ?? [];
        $payload = is_array($payload) ? $payload : [];

        $user = new User();
        // Raw attributes: the model's `hashed` cast would otherwise turn the
        // plaintext credential the login form needs into a bcrypt hash.
        $user->setRawAttributes([
            'id' => 0,
            'email' => $credentials->email,
            'password' => $credentials->password,
            'first_name' => self::string($payload, 'first_name'),
            'last_name' => self::string($payload, 'last_name'),
            'company_name' => self::string($payload, 'company_name'),
            'language' => self::string($payload, 'language') ?: 'English',
            'new_device_detection' => self::string($payload, 'new_device_detection'),
        ], true);

        return $user;
    }

    /**
     * The device row the CA shows for the current session (old
     * `Helper::getDevices()` read `devices`; v1 reads `/api/user/devices`).
     */
    public static function getDevices(int $userId): object
    {
        $rows = PanelClient::instance()->devices();
        $row = $rows[0] ?? [];

        return (object) [
            'ip_address' => is_string($row['ip_address'] ?? null) ? $row['ip_address'] : '',
            'browser' => is_string($row['browser'] ?? null) ? $row['browser'] : '',
            'device' => is_string($row['device'] ?? null) ? trim($row['device']) : '',
            'last_login' => is_string($row['last_login'] ?? null) ? $row['last_login'] : '',
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private static function string(array $payload, string $key): string
    {
        return is_string($payload[$key] ?? null) ? trim($payload[$key]) : '';
    }
}
