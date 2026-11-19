<?php

namespace Tests\Feature\Docs;

use Symfony\Component\Finder\Finder;
use Tests\TestCase;

/**
 * `php artisan test` reports 0 incomplete. A ported test where v1
 * deliberately differs asserts the v1 contract and documents the old one; a
 * real difference is fixed – neither is parked as incomplete any more. This guard fails on any test code that can
 * mark a test incomplete: a `markTestIncomplete` call (method names are
 * case-insensitive in PHP) or an `IncompleteTestError`.
 *
 * Out of scope: the Dusk browser suite (`tests/Browser`, and
 * `DuskTestCase::markLegacySelectorMismatch`), which is
 * decided separately and `php artisan test` does not run. The scan walks every
 * PHP file under `tests/` with that **pinned exclusion list** (asserted
 * literally) and reads identifiers only, so comments and
 * strings may name the method.
 */
class NoIncompleteTestsTest extends TestCase
{
    /**
     * Paths under `tests/` the scan skips: the Dusk suite and its base class.
     *
     * @var list<string>
     */
    private const EXCLUDED_PATHS = ['Browser', 'DuskTestCase.php'];

    /**
     * Identifiers that mark a test incomplete, lower-cased.
     *
     * @var list<string>
     */
    private const FORBIDDEN = ['marktestincomplete', 'incompletetesterror'];

    public function test_the_exclusion_list_is_pinned_literally(): void
    {
        $this->assertSame(['Browser', 'DuskTestCase.php'], self::EXCLUDED_PATHS);
    }

    public function test_the_scan_flags_each_shape(): void
    {
        $fixture = <<<'PHP'
<?php
$this->markTestIncomplete('a');
self::markTestIncomplete();
static::MarkTestIncomplete('case does not matter');
\PHPUnit\Framework\Assert::markTestIncomplete('b');
throw new IncompleteTestError('c');
throw new \PHPUnit\Framework\IncompleteTestError('d');
PHP;

        $this->assertSame([2, 3, 4, 5, 6, 7], array_keys($this->offences($fixture)));
    }

    public function test_the_scan_ignores_comments_and_strings(): void
    {
        $fixture = <<<'PHP'
<?php
// markTestIncomplete('a') in a comment
/** Old: markTestIncomplete('Legacy mismatch: …') */
$text = 'markTestIncomplete';
$other = "IncompleteTestError";
$this->markTestSkipped('skipped is fine');
PHP;

        $this->assertSame([], $this->offences($fixture));
    }

    public function test_the_scan_skips_only_the_pinned_exclusions(): void
    {
        $root = sys_get_temp_dir().'/pa-incomplete-scan-'.uniqid('', true);
        mkdir($root.'/Browser', 0777, true);
        mkdir($root.'/Feature', 0777, true);
        $call = "<?php\n\$this->markTestIncomplete('x');\n";
        file_put_contents($root.'/Browser/PageTest.php', $call);
        file_put_contents($root.'/DuskTestCase.php', $call);
        file_put_contents($root.'/Feature/SomeTest.php', $call);
        file_put_contents($root.'/OtherCase.php', $call);

        try {
            $offenders = $this->scan($root);
        } finally {
            foreach (['/Browser/PageTest.php', '/DuskTestCase.php', '/Feature/SomeTest.php', '/OtherCase.php'] as $file) {
                @unlink($root.$file);
            }
            @rmdir($root.'/Browser');
            @rmdir($root.'/Feature');
            @rmdir($root);
        }

        $this->assertSame(['Feature/SomeTest.php:2', 'OtherCase.php:2'], $offenders);
    }

    public function test_no_test_outside_the_dusk_suite_can_be_marked_incomplete(): void
    {
        $this->assertSame([], $this->scan(base_path('tests')), 'Assert the v1 contract or fix the code instead.');
    }

    /**
     * The offences of one tree walk, as `path:line` strings, sorted.
     *
     * @return list<string>
     */
    private function scan(string $root): array
    {
        $offenders = [];

        $finder = Finder::create()
            ->files()
            ->in($root)
            ->name('*.php')
            ->ignoreDotFiles(false)
            ->ignoreVCS(true)
            ->filter(static function (\SplFileInfo $file) use ($root): bool {
                $relative = str_replace(rtrim($root, '/').'/', '', $file->getPathname());
                foreach (self::EXCLUDED_PATHS as $excluded) {
                    if ($relative === $excluded || str_starts_with($relative, $excluded.'/')) {
                        return false;
                    }
                }

                return true;
            });

        foreach ($finder as $file) {
            $relative = str_replace(rtrim($root, '/').'/', '', $file->getPathname());
            foreach (array_keys($this->offences((string) file_get_contents($file->getPathname()))) as $line) {
                $offenders[] = $relative.':'.$line;
            }
        }

        sort($offenders);

        return $offenders;
    }

    /**
     * The lines (1-based) whose code names a forbidden identifier.
     *
     * @return array<int, string>
     */
    private function offences(string $code): array
    {
        $found = [];

        foreach (token_get_all($code) as $token) {
            if (! is_array($token) || ! in_array($token[0], [T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED, T_NAME_RELATIVE], true)) {
                continue;
            }

            $segments = explode('\\', $token[1]);
            $name = strtolower((string) end($segments));
            if (in_array($name, self::FORBIDDEN, true)) {
                $found[$token[2]] = $token[1];
            }
        }

        return $found;
    }
}
