<?php

namespace App\Services\Account;

use App\Models\Device;
use App\Models\User;
use App\Support\UserAgent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Logged-in devices / session management.
 *
 * Live logins come from the `sessions` table (Sanctum session driver); the
 * parsed fingerprints live in `devices` so a session can be matched to a
 * remembered device and forgotten. All of that matching lives here so the
 * controller only validates and shapes the response.
 */
final class DeviceService
{
    /**
     * The user's live sessions, each joined to its remembered device (created
     * on first sight so "forget" can find it later).
     *
     * @return list<DeviceView>
     */
    public function forUser(User $user, string $currentSessionId): array
    {
        $sessions = DB::table('sessions')
            ->where('user_id', $user->id)
            ->get(['id as session_id', 'ip_address', 'user_agent']);

        $devices = Device::query()
            ->where('authenticatable_type', $user::class)
            ->where('authenticatable_id', $user->id)
            ->get();

        $rows = [];
        $matched = [];
        foreach ($sessions as $session) {
            $sessionId = Payload::nullableString($session->session_id);
            $ipAddress = Payload::nullableString($session->ip_address);
            $userAgent = Payload::nullableString($session->user_agent);

            $parsed = UserAgent::parse($userAgent);

            $device = $devices->first(fn (Device $d) => $d->ip_address === $ipAddress
                && $d->browser === $parsed['browser']
                && $d->device === $parsed['device'])
                ?? Device::query()->create([
                    'authenticatable_type' => $user::class,
                    'authenticatable_id' => $user->id,
                    'ip_address' => $ipAddress,
                    'user_agent' => $userAgent,
                    'browser' => $parsed['browser'],
                    'device' => $parsed['device'],
                    'detection' => $user->new_device_detection,
                    'last_login' => now(),
                ]);

            $matched[$device->id] = true;

            $rows[] = new DeviceView(
                deviceId: $device->id,
                sessionId: $sessionId,
                ipAddress: $ipAddress,
                browser: $parsed['browser'],
                device: $parsed['device'],
                lastLogin: $device->last_login?->diffForHumans(),
                current: $sessionId === $currentSessionId,
            );
        }

        // Remembered devices without a live session are listed too – the old
        // panel's index did.
        foreach ($devices as $device) {
            if (isset($matched[$device->id])) {
                continue;
            }

            $rows[] = new DeviceView(
                deviceId: $device->id,
                sessionId: null,
                ipAddress: $device->ip_address,
                browser: $device->browser,
                device: $device->device,
                lastLogin: $device->last_login?->diffForHumans(),
                current: false,
            );
        }

        return $rows;
    }

    /**
     * Record the login on the request's device fingerprint, creating the row if
     * this is the first time the device is seen.
     */
    public function touch(User $user, Request $request): void
    {
        $parsed = UserAgent::parse($request->userAgent());

        $device = Device::query()->firstOrCreate(
            [
                'authenticatable_type' => $user::class,
                'authenticatable_id' => $user->id,
                'ip_address' => $request->ip(),
                'browser' => $parsed['browser'],
                'device' => $parsed['device'],
            ],
            [
                'user_agent' => $request->userAgent(),
                'detection' => $user->new_device_detection,
                'last_login' => now(),
            ],
        );

        $device->update(['last_login' => now()]);
    }

    /**
     * Forget a device: delete its fingerprint and end its session if it is
     * still open.
     *
     * @return bool true when the ended session is the caller's own (204)
     */
    public function forget(User $user, int $deviceId, string $currentSessionId): bool
    {
        $device = Device::query()
            ->whereKey($deviceId)
            ->where('authenticatable_type', $user::class)
            ->where('authenticatable_id', $user->id)
            ->firstOrFail();

        // A browser keeps several sessions with the same fingerprint; forgetting
        // the device must end every one of them, not only the first (a live
        // run once left 4 of 5 sessions logged in).
        $sessions = DB::table('sessions')
            ->where('user_id', $user->id)
            ->where('user_agent', $device->user_agent)
            ->where('ip_address', $device->ip_address);

        $endedCurrent = (clone $sessions)->where('id', $currentSessionId)->exists();
        $sessions->delete();

        $device->delete();

        // Always invalidate the remember cookie: a remembered device without a
        // live session must be logged out too.
        $user->forceFill(['remember_token' => null])->save();

        return $endedCurrent;
    }

    /**
     * End one session by id.
     *
     * @return bool true when the ended session is the caller's own (204)
     *
     * @throws ValidationException when the session is not the user's
     */
    public function logout(User $user, string $sessionId, string $currentSessionId): bool
    {
        $session = DB::table('sessions')
            ->where('id', $sessionId)
            ->where('user_id', $user->id)
            ->first();

        if ($session === null) {
            throw ValidationException::withMessages(['session_id' => ['Invalid value']]);
        }

        DB::table('sessions')->where('id', $sessionId)->delete();

        // Invalidate the remember cookie too (old DeviceController::logout).
        $user->forceFill(['remember_token' => null])->save();

        return $sessionId === $currentSessionId;
    }
}
