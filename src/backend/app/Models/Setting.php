<?php

namespace App\Models;

use Illuminate\Container\Container;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use PanelAlpha\ClientArea\Support\Payload;

class Setting extends Model
{
    /**
     * The container key of the settings map read for the current request or
     * queued job.
     */
    public const string VALUES = 'settings.values';

    /**
     * Settings kept encrypted at rest with the app key (`APP_KEY`, persisted
     * in /app/data/app_key, never in the database): the Engine token reaches
     * every project on the Engine, so a copy of the SQLite file alone must not
     * hand it out. Written and read only through set() and get(); the
     * migration `…_encrypt_secret_settings` sealed the rows written before.
     */
    public const array ENCRYPTED = ['engine-api-token'];

    /**
     * The mark of an encrypted value. A value without it is a plaintext row
     * from before the encryption, which get() still reads.
     */
    public const string ENCRYPTED_PREFIX = 'encrypted:';

    protected $fillable = [
        'name',
        'value',
    ];

    public static function get(string $name, ?string $default = null): ?string
    {
        $value = Payload::nullableString(self::values()[$name] ?? null);
        if ($value !== null && self::isSecret($name)) {
            $value = self::reveal($name, $value);
        }

        return $value ?? $default;
    }

    public static function set(string $name, string $value): self
    {
        $setting = static::query()->updateOrCreate(
            ['name' => $name],
            ['value' => self::stored($name, $value)],
        );
        self::forget();

        return $setting;
    }

    /**
     * Drop the map read for this request, so the next `get()` sees a write.
     */
    public static function forget(): void
    {
        Container::getInstance()->forgetInstance(self::VALUES);
    }

    public static function isSecret(string $name): bool
    {
        return in_array($name, self::ENCRYPTED, true);
    }

    /**
     * The column value for a setting: a secret is encrypted with the app key
     * and marked, anything else is stored as given.
     */
    public static function stored(string $name, string $value): string
    {
        if (! self::isSecret($name)) {
            return $value;
        }

        return self::ENCRYPTED_PREFIX.Crypt::encryptString($value);
    }

    public static function isEncrypted(string $stored): bool
    {
        return str_starts_with($stored, self::ENCRYPTED_PREFIX);
    }

    /**
     * A secret's plaintext. A row from before the encryption is read as it is;
     * one sealed with another app key (a lost /app/data/app_key) reads as unset
     * – the Engine connection then answers "not configured", and the entrypoint
     * writes the token the Engine delivers again at the next start.
     */
    private static function reveal(string $name, string $stored): ?string
    {
        if (! self::isEncrypted($stored)) {
            return $stored;
        }

        try {
            return Crypt::decryptString(substr($stored, strlen(self::ENCRYPTED_PREFIX)));
        } catch (DecryptException) {
            // The name only, never the value.
            Log::warning('A secret setting cannot be decrypted with the current app key; set it again.', ['setting' => $name]);

            return null;
        }
    }

    /**
     * Every setting, read with one query per request or queued job instead of
     * one per key (`/home` used to read 23 keys one by one). The map is a
     * scoped container instance, which Laravel forgets between requests and
     * between queued jobs, so a long-running worker never keeps a stale value.
     * The values are the stored ones: get() decrypts a secret.
     *
     * @return array<string, mixed>
     */
    private static function values(): array
    {
        $container = Container::getInstance();
        if (! $container->bound(self::VALUES)) {
            $container->scoped(self::VALUES, static fn (): array => static::query()->pluck('value', 'name')->all());
        }

        return Payload::object($container->make(self::VALUES));
    }
}
