<?php

namespace App\Console\Commands;

use App\Models\Setting;
use Illuminate\Console\Command;
use PanelAlpha\ClientArea\Support\Payload;

class SettingsSetCommand extends Command
{
    protected $signature = 'settings:set {name} {value?} {--from-file=}';

    protected $description = 'Set an application setting';

    public function handle(): int
    {
        $name = Payload::string($this->argument('name'));

        $fromFile = $this->option('from-file');
        if (is_string($fromFile) && $fromFile !== '') {
            $value = @file_get_contents($fromFile);
            if ($value === false) {
                $this->error("Unable to read the file [{$fromFile}].");

                return self::FAILURE;
            }
        } else {
            $value = $this->argument('value');
            if (! is_string($value) || $value === '') {
                $this->error('A value or --from-file is required.');

                return self::FAILURE;
            }
        }

        if (! $this->validateValue($name, $value)) {
            return self::FAILURE;
        }

        Setting::set($name, $value);
        $this->info('DONE');

        return self::SUCCESS;
    }

    /**
     * The Engine CA setting holds a PEM certificate Guzzle verifies against, so
     * an invalid one would break every Engine call. Everything
     * else keeps the old free-form behaviour.
     */
    private function validateValue(string $name, string $value): bool
    {
        if ($name !== 'engine-api-ca') {
            return true;
        }

        if (trim($value) === '' || ! $this->isPemCertificate($value)) {
            $this->error('The engine-api-ca value must be a PEM certificate.');

            return false;
        }

        return true;
    }

    private function isPemCertificate(string $value): bool
    {
        if (! function_exists('openssl_x509_read')) {
            $this->error('The openssl extension is required to validate a PEM certificate.');

            return false;
        }

        // openssl_x509_read() accepts the first certificate of a PEM bundle,
        // which is exactly what Guzzle's `verify` file may contain.
        return @openssl_x509_read($value) !== false;
    }
}
