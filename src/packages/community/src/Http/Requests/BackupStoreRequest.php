<?php

namespace PanelAlpha\Community\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The active backup store. `location` is the directory (local), the remote
 * path (ftp, ftps, sftp) or the bucket name (s3); an S3 folder goes in
 * `credentials.prefix`. A local directory must be one the Engine persists: the
 * Engine refuses the rest with a message naming its own paths, which the Client
 * Area may not show (`EngineText::leaksInternals`), so the panel checks the same
 * rule first.
 */
class BackupStoreRequest extends FormRequest
{
    public const array DRIVERS = ['local', 's3', 'ftp', 'ftps', 'sftp'];

    /**
     * The roots the Engine keeps when its container is recreated
     * (engine `NormalizesBackupContainerCredentials::PERSISTENT_LOCATION_ROOTS`).
     */
    public const array LOCAL_ROOTS = ['/home', '/opt/panelalpha', '/var/www/html/storage'];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @param  array<array-key, mixed>|null  $input  the request body, to pick the driver's credential rules
     * @return array<string, mixed>
     */
    public function rules(?array $input = null): array
    {
        $input ??= $this->all();
        $driver = Payload::string($input['driver'] ?? null);

        $location = ['required', 'string', 'max:255'];
        if ($driver === 'local') {
            $location[] = static function (string $attribute, mixed $value, Closure $fail): void {
                if (! is_string($value) || ! self::isPersistentLocalLocation($value)) {
                    $fail('Choose a directory inside /home/<name>, /opt/panelalpha or /var/www/html/storage. Backups stored anywhere else are lost when the Engine is updated.');
                }
            };
        }

        $rules = [
            'driver' => ['required', 'string', Rule::in(self::DRIVERS)],
            'location' => $location,
            'credentials' => $driver === 'local' || $driver === '' ? ['nullable', 'array'] : ['required', 'array'],
        ];

        $string = ['string', 'max:255'];
        $port = ['required', 'integer', 'between:1,65535'];
        // The Engine reads `vault:<id>` in a secret as a reference to its vault;
        // the owner gives the panel the secret itself, never a reference.
        $vault = self::notAVaultReference(...);

        return $rules + match ($driver) {
            's3' => [
                'credentials.access_key_id' => ['required', ...$string],
                'credentials.secret_access_key' => ['required', ...$string, $vault],
                'credentials.region' => ['required', ...$string],
                'credentials.endpoint' => ['nullable', 'url', 'max:255'],
                'credentials.use_path_style_endpoint' => ['nullable', 'boolean'],
                'credentials.prefix' => ['nullable', ...$string],
            ],
            'ftp', 'ftps' => [
                'credentials.host' => ['required', ...$string],
                'credentials.port' => $port,
                'credentials.username' => ['required', ...$string],
                'credentials.password' => ['required', ...$string, $vault],
            ],
            'sftp' => [
                'credentials.host' => ['required', ...$string],
                'credentials.port' => $port,
                'credentials.username' => ['required', ...$string],
                'credentials.password' => ['required_without:credentials.private_key', 'nullable', ...$string, $vault],
                'credentials.private_key' => ['required_without:credentials.password', 'nullable', 'string', 'max:10000', $vault],
                'credentials.passphrase' => ['nullable', ...$string, $vault],
            ],
            default => [],
        };
    }

    /**
     * The Engine's rule: at or under one of {@see LOCAL_ROOTS}, never `/home`
     * itself, no `..` segment.
     */
    public static function isPersistentLocalLocation(string $location): bool
    {
        $path = rtrim(str_replace('\\', '/', trim($location)), '/');
        if ($path === '' || $path === '/home' || str_contains($path, '..') || str_contains($path, "\0")) {
            return false;
        }
        foreach (self::LOCAL_ROOTS as $root) {
            if ($path === $root || str_starts_with($path.'/', $root.'/')) {
                return true;
            }
        }

        return false;
    }

    private static function notAVaultReference(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && str_starts_with(strtolower(trim($value)), 'vault:')) {
            $fail('Enter the secret itself, not a vault reference.');
        }
    }
}
