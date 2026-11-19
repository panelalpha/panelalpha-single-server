<?php

namespace Tests\Feature;

use App\Support\StorageDirectories;
use RuntimeException;
use Tests\TestCase;

/**
 * The storage bootstrap moved from an inline `! is_dir` + `mkdir`
 * loop in `bootstrap/app.php` into `App\Support\StorageDirectories::ensure()`,
 * which uses the race-safe `! is_dir && ! @mkdir && ! is_dir` form. Two
 * php-fpm workers (or a worker and the queue) booting on a fresh data directory
 * could otherwise race and the loser would get `mkdir(): File exists`; a real
 * failure must name the path.
 *
 * The K4 fresh-directory behaviour (`FreshDataDirectoryTest`) still proves the
 * whole tree is created on boot; this class proves the helper's own edges.
 *
 * @see src/backend/bootstrap/app.php
 * @see src/backend/app/Support/StorageDirectories.php
 */
class StorageDirectoriesTest extends TestCase
{
    /** @var list<string> */
    private array $roots = [];

    protected function tearDown(): void
    {
        foreach ($this->roots as $root) {
            $this->removeDirectory($root);
        }
        $this->roots = [];

        parent::tearDown();
    }

    public function test_an_existing_directory_raises_no_warning(): void
    {
        $root = $this->temporaryRoot();
        $existing = $root.'/framework/views';
        mkdir($existing, 0777, true);

        // Turn every PHP warning into a failure: a bare `mkdir()` on an existing
        // directory emits `mkdir(): File exists`, the race loser's error the
        // helper must avoid.
        set_error_handler(static function (int $severity, string $message): bool {
            throw new RuntimeException($message);
        });

        try {
            StorageDirectories::ensure($root, ['framework/views']);
        } finally {
            restore_error_handler();
        }

        $this->assertDirectoryExists($existing);
    }

    public function test_a_path_under_a_non_directory_throws_with_the_path(): void
    {
        $root = $this->temporaryRoot();
        file_put_contents($root.'/file', 'not a directory');

        try {
            StorageDirectories::ensure($root.'/file', ['sub']);
            $this->fail('StorageDirectories::ensure() must throw when the parent is a file.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString($root.'/file/sub', $e->getMessage());
        }
    }

    public function test_the_race_loser_does_not_throw_when_the_directory_appeared(): void
    {
        // The middle `! @mkdir` plus the trailing `! is_dir` is
        // the race-safe form. Between the first `is_dir` and the `mkdir` a
        // second process can create the directory, so `mkdir` fails with
        // EEXIST while the second `is_dir` must confirm it instead of throwing.
        // A stream wrapper makes that exact interleaving deterministic: the
        // first stat reports "absent", `mkdir` reports the EEXIST failure and
        // the second stat reports the directory.
        $protocol = 'race'.bin2hex(random_bytes(6));
        RaceStreamWrapper::$directory = $this->temporaryRoot();
        RaceStreamWrapper::$statCalls = 0;
        RaceStreamWrapper::$mkdirCalls = 0;
        stream_wrapper_register($protocol, RaceStreamWrapper::class);

        try {
            StorageDirectories::ensure($protocol.'://root', ['sub']);
        } finally {
            stream_wrapper_unregister($protocol);
        }

        $this->assertSame(2, RaceStreamWrapper::$statCalls, 'The race-safe form must stat before and after the failed mkdir.');
        $this->assertSame(1, RaceStreamWrapper::$mkdirCalls);
        $this->assertDirectoryExists(RaceStreamWrapper::$directory);
    }

    private function temporaryRoot(): string
    {
        $root = sys_get_temp_dir().'/panelalpha-storage-'.bin2hex(random_bytes(6));
        mkdir($root, 0777, true);
        $this->roots[] = $root;

        return $root;
    }

    private function removeDirectory(string $path): void
    {
        if (! is_dir($path)) {
            if (file_exists($path)) {
                @unlink($path);
            }

            return;
        }

        foreach ((array) scandir($path) as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $this->removeDirectory($path.'/'.$entry);
        }

        @rmdir($path);
    }
}

/**
 * A filesystem wrapper whose first stat reports "absent" and whose `mkdir`
 * fails, so the second stat is what proves the race-safe form. PHP assigns the
 * stream context to the `$context` property (typed `mixed` so the assignment
 * cannot fail).
 */
final class RaceStreamWrapper
{
    public mixed $context = null;

    public static string $directory = '';

    public static int $statCalls = 0;

    public static int $mkdirCalls = 0;

    /**
     * @return array<int|string, int>|false
     */
    public function url_stat(string $path, int $flags): array|false
    {
        self::$statCalls++;
        if (self::$statCalls === 1) {
            return false;
        }

        return stat(self::$directory) ?: false;
    }

    public function mkdir(string $path, int $mode, int $options): bool
    {
        self::$mkdirCalls++;

        return false;
    }
}
