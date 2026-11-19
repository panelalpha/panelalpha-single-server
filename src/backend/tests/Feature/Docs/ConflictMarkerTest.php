<?php

namespace Tests\Feature\Docs;

use Symfony\Component\Finder\Finder;
use Tests\TestCase;

/**
 * A merge once left conflict markers in a migration document while the suite
 * stayed green, so a docs guard
 * must fail on them. This test walks every `*.md` and `*.php` file under `src/`
 * and fails on `<<<<<<<`, `>>>>>>>` or a line that is exactly `=======`.
 *
 * The container has no `.git` (the worktree root is not mounted), so the guard
 * walks the tree with a **pinned exclusion list** – generated/vendored
 * directories only, never an allow-list of source directories.
 * The list is asserted literally, so a new generated directory must be added
 * deliberately. Dot-paths are scanned too: the only exclusions are the pinned
 * directory names.
 */
class ConflictMarkerTest extends TestCase
{
    /**
     * Directory names the scan never descends into: dependencies and generated
     * or mounted data, none of them tracked source.
     *
     * @var list<string>
     */
    private const EXCLUDED_DIRECTORIES = [
        'vendor',
        'node_modules',
        'data',
        'storage',
    ];

    public function test_the_conflict_marker_scan_flags_each_pattern(): void
    {
        $fixture = "line one\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> other\nline two\n";

        $this->assertSame(
            [2 => '<<<<<<< HEAD', 4 => '=======', 6 => '>>>>>>> other'],
            $this->markers($fixture),
            'Each of the three conflict-marker shapes must be reported.',
        );

        // A Markdown heading underline is not a conflict marker: exactly seven
        // `=` on their own is the marker, a longer or shorter run is not.
        $this->assertSame([], $this->markers("Title\n======\n"));
        $this->assertSame([], $this->markers("Title\n==========\n"));
        $this->assertSame([], $this->markers("A ======= B\n"));
    }

    public function test_the_exclusion_list_is_pinned_literally(): void
    {
        $this->assertSame([
            'vendor',
            'node_modules',
            'data',
            'storage',
        ], self::EXCLUDED_DIRECTORIES);
    }

    public function test_no_tracked_docs_or_php_file_carries_a_conflict_marker(): void
    {
        $this->assertSame([], $this->scan(base_path('..')), 'A doc or PHP file carries a conflict marker.');
    }

    /**
     * Review-fix: the guard's Finder must scan dot-paths (a tracked
     * `v1/.hidden/x.md` is in scope) and skip exactly the pinned exclusion
     * directories. `ignoreDotFiles(true)` silently dropped dot-paths, which
     * `test_the_exclusion_list_is_pinned_literally` could not catch.
     */
    public function test_the_scan_covers_dot_directories_and_skips_only_the_pinned_exclusions(): void
    {
        $root = sys_get_temp_dir().'/pa-conflict-scan-'.uniqid('', true);
        mkdir($root.'/.hidden', 0777, true);
        mkdir($root.'/vendor', 0777, true);
        file_put_contents($root.'/.hidden/marker.md', "<<<<<<< HEAD\n");
        file_put_contents($root.'/vendor/marker.md', "<<<<<<< HEAD\n");
        file_put_contents($root.'/plain.php', "<<<<<<< HEAD\n");

        try {
            $offenders = $this->scan($root);
        } finally {
            @unlink($root.'/.hidden/marker.md');
            @unlink($root.'/vendor/marker.md');
            @unlink($root.'/plain.php');
            @rmdir($root.'/.hidden');
            @rmdir($root.'/vendor');
            @rmdir($root);
        }

        $joined = implode("\n", $offenders);
        $this->assertStringContainsString('.hidden/marker.md:1:<<<<<<< HEAD', $joined, 'a dot-directory is scanned');
        $this->assertStringContainsString('plain.php:1:<<<<<<< HEAD', $joined, 'a normal file is scanned');
        $this->assertStringNotContainsString('vendor/marker.md', $joined, 'a pinned exclusion is skipped');
    }

    /**
     * The findings of one tree walk, as `path:line:marker` strings.
     *
     * @return list<string>
     */
    private function scan(string $root): array
    {
        $offenders = [];

        $finder = Finder::create()
            ->files()
            ->in($root)
            ->name(['*.md', '*.php'])
            ->exclude(self::EXCLUDED_DIRECTORIES)
            ->ignoreDotFiles(false)
            ->ignoreVCS(true);

        foreach ($finder as $file) {
            foreach ($this->markers((string) file_get_contents($file->getPathname())) as $line => $marker) {
                $offenders[] = str_replace(rtrim($root, '/').'/', '', $file->getPathname()).':'.$line.':'.$marker;
            }
        }

        return $offenders;
    }

    /**
     * The line numbers (1-based) that carry a conflict marker.
     *
     * @return array<int, string>
     */
    private function markers(string $contents): array
    {
        $found = [];

        foreach (preg_split('/\r?\n/', $contents) ?: [] as $index => $line) {
            if (str_starts_with($line, '<<<<<<<') || str_starts_with($line, '>>>>>>>') || trim($line) === '=======') {
                $found[$index + 1] = trim($line);
            }
        }

        return $found;
    }
}
