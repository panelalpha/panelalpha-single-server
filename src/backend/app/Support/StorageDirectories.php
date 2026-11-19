<?php

namespace App\Support;

use RuntimeException;

/**
 * Prepares the storage tree before the framework boots.
 *
 * The container entrypoint creates these directories on start, but a checkout
 * run (the test suite, `php artisan`) can see a fresh data directory: the Blade
 * compiler throws "Please provide a valid cache path" when
 * `realpath(storage_path('framework/views'))` is false, so the suite must not
 * depend on a previous run having created it.
 *
 * Two php-fpm workers, or a worker and the queue, can boot at the same time on
 * a fresh directory, so a plain `is_dir` + `mkdir` races and the loser gets
 * `mkdir(): File exists`. The double `is_dir`/`@mkdir` form is race-safe: a
 * concurrent creator makes the suppressed `mkdir` fail and the second `is_dir`
 * confirms the directory now exists; any other failure (for example a file in
 * the path) throws a `RuntimeException` naming the path, so the operator sees
 * which directory could not be created.
 */
final class StorageDirectories
{
    /**
     * @param  string  $root  the storage directory the paths are created under
     * @param  list<string>  $directories  paths relative to $root
     *
     * @throws RuntimeException when a directory cannot be created
     */
    public static function ensure(string $root, array $directories): void
    {
        foreach ($directories as $directory) {
            $path = $root.'/'.$directory;

            if (! is_dir($path) && ! @mkdir($path, 0777, true) && ! is_dir($path)) {
                throw new RuntimeException("Unable to create the storage directory [{$path}].");
            }
        }
    }
}
