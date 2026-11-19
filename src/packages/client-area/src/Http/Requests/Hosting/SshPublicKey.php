<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

final class SshPublicKey implements ValidationRule
{
    public const MESSAGE = 'The public key must be one OpenSSH key line: ssh-ed25519, ecdsa-sha2-nistp256/384/521 or ssh-rsa of at least 2048 bits.';

    public const MIN_RSA_BITS = 2048;

    public const MAX_RSA_BITS = 16384;

    private const TYPES = [
        'ssh-ed25519',
        'ecdsa-sha2-nistp256',
        'ecdsa-sha2-nistp384',
        'ecdsa-sha2-nistp521',
        'sk-ssh-ed25519@openssh.com',
        'sk-ecdsa-sha2-nistp256@openssh.com',
        'ssh-rsa',
    ];

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! self::isValid($value)) {
            $fail(self::MESSAGE);
        }
    }

    public static function isValid(string $key): bool
    {
        $parts = preg_split('/\s+/', trim($key));
        if ($parts === false || count($parts) < 2 || str_contains(trim($key), "\n")) {
            return false;
        }
        [$type, $encoded] = $parts;
        if (! in_array($type, self::TYPES, true)) {
            return false;
        }

        $blob = base64_decode($encoded, true);
        if ($blob === false || $blob === '') {
            return false;
        }

        $offset = 0;
        $named = self::readString($blob, $offset);
        if ($named !== $type) {
            return false;
        }

        if ($type !== 'ssh-rsa') {
            return true;
        }

        $exponent = self::readString($blob, $offset);
        $modulus = $exponent === null ? null : self::readString($blob, $offset);
        if ($modulus === null) {
            return false;
        }
        $bits = self::bits($modulus);

        return $bits >= self::MIN_RSA_BITS && $bits <= self::MAX_RSA_BITS;
    }

    private static function readString(string $blob, int &$offset): ?string
    {
        if (strlen($blob) < $offset + 4) {
            return null;
        }
        $length = unpack('N', substr($blob, $offset, 4));
        $length = is_array($length) ? (int) ($length[1] ?? 0) : 0;
        $offset += 4;
        if ($length <= 0 || strlen($blob) < $offset + $length) {
            return null;
        }
        $value = substr($blob, $offset, $length);
        $offset += $length;

        return $value;
    }

    private static function bits(string $number): int
    {
        $number = ltrim($number, "\0");
        if ($number === '') {
            return 0;
        }

        return (strlen($number) - 1) * 8 + strlen(decbin(ord($number[0])));
    }
}
