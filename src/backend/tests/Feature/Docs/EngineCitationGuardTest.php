<?php

namespace Tests\Feature\Docs;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Every Engine stub in the test suite must carry an
 * inline citation that can be traced back to the Engine code that builds the
 * body.
 *
 * A stub is `Http::response()`, `Http::sequence()` / `fakeSequence()` and every
 * `->push*()`, every top-level value of an `Http::fake([...])` array (mixed
 * blocks included) that is not itself an inline stub – an array, a string, an
 * int status, a variable or a closure returning an array – and a closure
 * argument of `Http::fake(...)` returning an array. {@see EngineCitationScanner}
 * does the detection.
 *
 * A citation is `// Engine: <path>:<line>` (the path must have at least one
 * directory that resolves to a committed Engine file and the line must exist in
 * that file, {@see engine-paths.txt}) or `// External: <source>` on a stub whose
 * `Http::fake` host key is not an Engine host.
 *
 * Uncited stubs that already existed at `ea7c307` are grandfathered in
 * {@see EngineCitationBaseline}, keyed by file and normalised stub text so a
 * file can neither trade one fake for another nor hide behind a line shift. The
 * baseline may only shrink.
 */
class EngineCitationGuardTest extends TestCase
{
    /** The guard's own code carries the patterns it scans for. */
    private const SKIP = [
        'tests/Feature/Docs/EngineCitationBaseline.php',
        'tests/Feature/Docs/EngineCitationGuardTest.php',
        'tests/Feature/Docs/EngineCitationScanner.php',
    ];

    public function test_the_uncited_stub_baseline_only_shrinks(): void
    {
        $current = $this->offenders();
        $diff = EngineCitationScanner::baselineDiff($current, EngineCitationBaseline::OFFENDERS);

        $this->assertSame(
            [],
            $diff['grown'],
            "These Engine stubs gained an uncited instance (the baseline may only shrink; cite the Engine code that builds the body):\n"
                .implode("\n", $diff['grown']),
        );

        $this->assertSame(
            [],
            $diff['shrunk'],
            "These files have fewer uncited stubs now; lower their EngineCitationBaseline entries (it may only shrink):\n"
                .implode("\n", $diff['shrunk']),
        );
    }

    public function test_a_file_cannot_trade_one_fake_for_another(): void
    {
        // Same total count in the file, a different uncited stub: the text key
        // must still flag it as grown (a file-count-only baseline would not).
        $current = ['tests/Feature/X.php' => ['Http::response([\'new\' => 1]);' => 1]];
        $baseline = ['tests/Feature/X.php' => ['Http::response([\'old\' => 1]);' => 1]];

        $this->assertNotEmpty(EngineCitationScanner::baselineDiff($current, $baseline)['grown']);
    }

    public function test_the_baseline_can_shrink(): void
    {
        $current = ['tests/Feature/X.php' => []];
        $baseline = ['tests/Feature/X.php' => ['Http::response([\'old\' => 1]);' => 1]];

        $this->assertSame([], EngineCitationScanner::baselineDiff($current, $baseline)['grown']);
        $this->assertNotEmpty(EngineCitationScanner::baselineDiff($current, $baseline)['shrunk']);
    }

    /**
     * Every stub shape the scanner claims to catch must be caught, and a real
     * `// Engine:` citation (an existing path and line) must clear it. One case
     * per hole the scanner once had.
     *
     * @param  list<string>  $lines
     * @param  int  $expected
     */
    #[DataProvider('stubShapes')]
    public function test_every_stub_shape_is_detected(array $lines, int $expected): void
    {
        $this->assertCount($expected, EngineCitationScanner::scanLines($lines, $this->fixtureIndex()));
    }

    /** A cited `core/app/.../FileController.php` with 60 lines, plus `routes/api.php`. */
    private function fixtureIndex(): array
    {
        return EngineCitationScanner::pathIndex([
            'core/app/Http/Controllers/User/FileController.php'."\t".'60',
            'core/routes/api.php'."\t".'500',
        ]);
    }

    /**
     * @return array<string, array{0: list<string>, 1: int}>
     */
    public static function stubShapes(): array
    {
        return [
            'Http::response' => [['Http::response([\'data\' => []]);'], 1],
            'cited Http::response' => [['// Engine: User/FileController.php:60', 'Http::response([\'data\' => []]);'], 0],
            'Http::sequence and pushes' => [[
                'Http::fake([',
                "    'u' => Http::sequence()",
                "        ->push(['a' => 1])",
                "        ->push(['a' => 2]),",
                ']);',
            ], 3],
            'fakeSequence pushes' => [['Http::fakeSequence()', "    ->push(['a' => 1])", "    ->push(['a' => 2]);"], 3],
            'array stub in a mixed block' => [[
                'Http::fake([',
                "    'a' => Http::response(['data' => []]),",
                "    'b' => ['data' => []],",
                ']);',
            ], 2],
            'a string stub in a fake array' => [['Http::fake([', "    'u' => 'body',", ']);'], 1],
            'variable stub' => [['Http::fake([', "    'a' => \$body,", ']);'], 1],
            'int status stub' => [['Http::fake([', "    'a' => 500,", ']);'], 1],
            'closure value returning an array' => [["Http::fake(['a' => fn () => ['data' => []]]);"], 1],
            'closure value returning a response' => [["Http::fake(['a' => function () { return Http::response('x'); }]);"], 1],
            'fake() closure argument returning an array' => [["Http::fake(fn () => ['data' => []]);"], 1],
            'external on a non-engine host' => [[
                '// External: api.wordpress.org',
                "Http::fake(['api.wordpress.org/*' => ['data' => []]]);",
            ], 0],
            'external on an engine host is not a citation' => [[
                '// External: api.wordpress.org',
                "Http::fake(['engine.example.com/*' => ['data' => []]]);",
            ], 1],
            'bare file name is not a citation' => [['// Engine: FileController.php:60', 'Http::response([\'data\' => []]);'], 1],
            'a line beyond the file is not a citation' => [['// Engine: User/FileController.php:61', 'Http::response([\'data\' => []]);'], 1],
            'a citation three lines above does not count' => [[
                '// Engine: User/FileController.php:60',
                '',
                '',
                'Http::response([\'data\' => []]);',
            ], 1],
            'a citation below the stub does not count' => [['Http::response([\'data\' => []]);', '// Engine: User/FileController.php:60'], 1],
            'routes api is not a citation' => [['// Engine: core/routes/api.php:141', 'Http::response([\'data\' => []]);'], 1],
            'the FQCN Http facade' => [["\\Illuminate\\Support\\Facades\\Http::response(['data' => []]);"], 1],
            'an aliased Http import' => [['use Illuminate\\Support\\Facades\\Http as H;', "H::response(['data' => []]);"], 1],
            'an aliased Http import with a citation' => [['use Illuminate\\Support\\Facades\\Http as H;', '// Engine: User/FileController.php:60', "H::response(['data' => []]);"], 0],
            'a shadowing Http import is not the facade' => [['use Foo\\Http;', "Http::response(['data' => []]);"], 0],
            'Http::fake($var)' => [['$stubs = ["a" => ["data" => []]];', 'Http::fake($stubs);'], 1],
            'a closure returning a variable' => [['$body = ["data" => []];', 'Http::fake(fn () => $body);'], 1],
            'a citation inside a string literal' => [["\$note = '// Engine: User/FileController.php:60';", "Http::response(['data' => []]);"], 1],
            'a * host needs an Engine citation' => [['// External: x', "Http::fake(['*' => ['data' => []]]);"], 1],
            'an engine.test host needs an Engine citation' => [['// External: x', "Http::fake(['engine.test/*' => ['data' => []]]);"], 1],
            'an engine.test host with an Engine citation' => [['// Engine: User/FileController.php:60', "Http::fake(['engine.test/*' => ['data' => []]]);"], 0],
            'an in-file line range is a citation' => [['// Engine: User/FileController.php:59-60', "Http::response(['data' => []]);"], 0],
            'a line range beyond the file is not' => [['// Engine: User/FileController.php:59-61', "Http::response(['data' => []]);"], 1],
            'an all-Engine fake is covered by the ancestor citation' => [['// Engine: User/FileController.php:60', 'Http::fake([', "  'engine.a/*' => ['data' => []],", "  'engine.b/*' => ['data' => []],", ']);'], 0],
            'a mixed fake does not cover a non-Engine key' => [['// Engine: User/FileController.php:60', 'Http::fake([', "  'engine.a/*' => ['data' => []],", "  'api.github.com/*' => ['data' => []],", ']);'], 1],
            'a mixed fake does not cover the later Engine keys' => [['// Engine: User/FileController.php:60', 'Http::fake([', "  'engine.a/*' => ['data' => ['a' => 1]],", "  'api.github.com/*' => ['data' => []],", "  'engine.b/*' => ['data' => ['b' => 2]],", ']);'], 2],
            'an External on a mixed non-Engine key' => [['// Engine: User/FileController.php:60', 'Http::fake([', "  'engine.a/*' => ['data' => []],", '  // External: api.github.com', "  'api.github.com/*' => ['data' => []],", ']);'], 0],
            'a Defensive marker cites an Engine host' => [['// Defensive (not an Engine shape): reason', "Http::fake(['engine.a/*' => ['data' => []]]);"], 0],
            'a Defensive marker plus an Engine citation is an error' => [[
                '// Engine: User/FileController.php:60',
                '// Defensive (not an Engine shape): reason',
                "Http::fake(['engine.a/*' => ['data' => []]]);",
            ], 1],
            'a Defensive conflict is final, not rescued by an ancestor citation' => [[
                '// Engine: User/FileController.php:60',
                'Http::fake([',
                '  // Engine: User/FileController.php:60',
                '  // Defensive (not an Engine shape): reason',
                "  'engine.a/*' => ['data' => []],",
                "  'engine.b/*' => ['data' => []],",
                ']);',
            ], 1],
            'a Defensive marker does not cover through a blank line' => [[
                '// Defensive (not an Engine shape): reason',
                '',
                "Http::response(['data' => []]);",
            ], 1],
            'a Defensive marker above the fake does not cover the entries' => [[
                '// Defensive (not an Engine shape): reason',
                'Http::fake([',
                "  'engine.a/*' => ['a' => 1],",
                "  'engine.b/*' => ['b' => 2],",
                ']);',
            ], 2],
            'a Defensive marker needs a non-empty reason' => [[
                '// Defensive (not an Engine shape):',
                "Http::response(['data' => []]);",
            ], 1],

            // The remaining stub shapes the scanner let through.
            'a scheme-prefixed engine host needs an Engine citation' => [[
                '// External: api.wordpress.org',
                "Http::fake(['https://engine.example.com/*' => ['data' => []]]);",
            ], 1],
            'a scheme-prefixed engine host with an Engine citation' => [[
                '// Engine: User/FileController.php:60',
                "Http::fake(['https://engine.example.com/*' => ['data' => []]]);",
            ], 0],
            'Http::fake(array(...))' => [["Http::fake(array('engine.a/*' => ['data' => []]));"], 1],
            'Http::fake(array(...)) with a citation' => [['// Engine: User/FileController.php:60', "Http::fake(array('engine.a/*' => ['data' => []]));"], 0],
            'Http::fake(array_merge([...]))' => [["Http::fake(array_merge(['engine.a/*' => ['data' => []]]));"], 1],
            'Http::fake(array_merge([...])) with a citation' => [['// Engine: User/FileController.php:60', "Http::fake(array_merge(['engine.a/*' => ['data' => []]]));"], 0],
            'the root \\Http alias' => [["\\Http::response(['data' => []]);"], 1],
            'the root \\Http alias with a citation' => [['// Engine: User/FileController.php:60', "\\Http::response(['data' => []]);"], 0],
            'the Facades\\Http alias' => [["Facades\\Http::response(['data' => []]);"], 1],
            'the Facades\\Http alias with a citation' => [['// Engine: User/FileController.php:60', "Facades\\Http::response(['data' => []]);"], 0],
        ];
    }

    public function test_a_made_up_engine_path_is_not_a_citation(): void
    {
        $offenders = EngineCitationScanner::scanLines(
            ['// Engine: core/app/Http/Controllers/User/Nope.php:12', 'Http::response([\'data\' => []]);'],
            $this->fixtureIndex(),
        );

        $this->assertCount(1, $offenders);
    }

    public function test_the_engine_path_list_only_covers_the_three_engine_roots(): void
    {
        $offenders = [];
        foreach (file(base_path('tests/Feature/Docs/engine-paths.txt')) ?: [] as $line) {
            $file = explode("\t", trim($line))[0];
            if ($file === '') {
                continue;
            }
            if (! str_starts_with($file, 'core/app/')
                && ! str_starts_with($file, 'core/config/')
                && ! str_starts_with($file, 'core/database/')
            ) {
                $offenders[] = $file;
            }
        }

        $this->assertSame(
            [],
            $offenders,
            'engine-paths.txt may only list core/app, core/config and core/database.',
        );
    }

    public function test_an_ambiguous_path_suffix_is_not_a_citation(): void
    {
        $engine = EngineCitationScanner::pathIndex([
            'core/app/A/Http/Foo.php'."\t".'9',
            'core/app/B/Http/Foo.php'."\t".'9',
        ]);

        $offenders = EngineCitationScanner::scanLines(
            ['// Engine: Http/Foo.php:5', 'Http::response([\'data\' => []]);'],
            $engine,
        );

        $this->assertCount(1, $offenders);
    }

    /**
     * @return array<string, array<string, int>> `tests/…/X.php` => normalised stub text => count
     */
    private function offenders(): array
    {
        $root = base_path('tests');
        $engine = EngineCitationScanner::pathIndex($this->enginePaths());

        $offenders = [];
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root));
        foreach ($files as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }

            $relative = 'tests'.substr($file->getPathname(), strlen($root));
            if (in_array($relative, self::SKIP, true)) {
                continue;
            }

            $lines = file($file->getPathname(), FILE_IGNORE_NEW_LINES) ?: [];
            $found = EngineCitationScanner::scanLines($lines, $engine);
            if ($found !== []) {
                ksort($found);
                $offenders[$relative] = $found;
            }
        }

        ksort($offenders);

        return $offenders;
    }

    /**
     * @return list<string>
     */
    private function enginePaths(): array
    {
        $path = base_path('tests/Feature/Docs/engine-paths.txt');
        $this->assertFileExists($path, 'The committed Engine path list is missing; run scripts/generate-engine-paths.sh.');

        return array_values(array_filter(array_map('trim', file($path) ?: [])));
    }
}
