<?php

namespace Tests\Feature;

use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use Tests\TestCase;

/**
 * The suite must pass with an empty `/app/data`. Only the
 * container entrypoint created `data/laravel/framework/*`, so a checkout run
 * (the test suite, `php artisan`) answered 500 "Please provide a valid cache
 * path" on the first Blade render (then the skeleton welcome page) because
 * `realpath(storage_path('framework/views'))` was false. `bootstrap/app.php`
 * now prepares the directories at boot.
 *
 * The real check (`backend/scripts/check-container-config.sh`) uses a fresh
 * tmpfs `/app/data`; this class proves the setup behaviourally by removing the
 * framework tree and re-booting the app the way a fresh checkout does.
 *
 * @see src/backend/bootstrap/app.php
 */
class FreshDataDirectoryTest extends TestCase
{
    public function test_a_fresh_storage_directory_is_prepared_on_boot(): void
    {
        $framework = storage_path('framework');
        $this->removeDirectory($framework);
        $this->assertDirectoryDoesNotExist($framework);

        // Re-run bootstrap/app.php exactly as a fresh checkout would (the
        // entrypoint never ran): createApplication() re-requires it.
        $this->refreshApplication();

        foreach (['views', 'cache/data', 'sessions', 'testing'] as $directory) {
            $this->assertDirectoryExists(storage_path('framework/'.$directory), $directory);
        }
        $this->assertDirectoryExists(storage_path('logs'));
        $this->assertDirectoryExists(storage_path('app/private'));
        $this->assertDirectoryExists(storage_path('app/public'));

        // CA: packages/client-area/src/main.js:1 (the SPA the CA serves at `/`;
        // the backend itself serves no page there since the skeleton welcome
        // page was removed).
        // The Blade compiler is what threw "Please provide a valid cache path"
        // before the fix. The health route renders a framework Blade view, so a
        // real request to it proves the compiled-view directory is usable.
        $this->get('/up')->assertStatus(200);
    }

    private function removeDirectory(string $path): void
    {
        if (! is_dir($path)) {
            return;
        }

        $items = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($items as $item) {
            $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
        }
        rmdir($path);
    }
}
