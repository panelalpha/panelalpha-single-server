<?php

namespace Tests\Feature\Docs;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Every Client Area request stub in the test suite must carry a
 * `// CA: <path>:<line>` citation (the request body is copied from the CA call
 * site) and every response-shape assertion a `// CA reads: <path>:<line>`
 * citation (the keys are the ones the CA reads).
 *
 * A request stub is a test HTTP client call whose receiver chain resolves to
 * `$this` (`$this->getJson(...)`, `$this->actingAs($u)->putJson(...)`,
 * `$this->json('POST', ...)` with two-plus arguments). A reads stub is an
 * `assertJson*` / `assertSee*` / `assertDontSee*` call. {@see CACitationScanner}
 * does the detection.
 *
 * A citation path must resolve to a committed Client Area file
 * ({@see client-area-paths.txt}) whose line count covers the cited line, and it
 * must name at least one directory. Uncited stubs that already existed when the
 * guard was introduced are grandfathered in {@see CACitationBaseline}, keyed by
 * file and normalised stub text so a file can neither trade one stub for another
 * nor hide behind a line shift. The baseline may only shrink: each area's fix
 * commit lowers its entries.
 */
class CACitationGuardTest extends TestCase
{
    /** The guard's own code carries the patterns it scans for. */
    private const SKIP = [
        'tests/Feature/Docs/CACitationBaseline.php',
        'tests/Feature/Docs/CACitationGuardTest.php',
        'tests/Feature/Docs/CACitationScanner.php',
    ];

    public function test_the_uncited_stub_baseline_only_shrinks(): void
    {
        $current = $this->offenders();
        $diff = CACitationScanner::baselineDiff($current, CACitationBaseline::OFFENDERS);

        $this->assertSame(
            [],
            $diff['grown'],
            "These CA stubs gained an uncited instance (the baseline may only shrink; cite the CA call site):\n"
                .implode("\n", $diff['grown']),
        );

        $this->assertSame(
            [],
            $diff['shrunk'],
            "These files have fewer uncited stubs now; lower their CACitationBaseline entries (it may only shrink):\n"
                .implode("\n", $diff['shrunk']),
        );
    }

    public function test_a_file_cannot_trade_one_stub_for_another(): void
    {
        $current = ['tests/Feature/X.php' => ['request: $this->getJson(\'/new\');' => 1]];
        $baseline = ['tests/Feature/X.php' => ['request: $this->getJson(\'/old\');' => 1]];

        $this->assertNotEmpty(CACitationScanner::baselineDiff($current, $baseline)['grown']);
    }

    public function test_the_baseline_can_shrink(): void
    {
        $current = ['tests/Feature/X.php' => []];
        $baseline = ['tests/Feature/X.php' => ['reads: ->assertJson([\'old\' => 1]);' => 1]];

        $this->assertSame([], CACitationScanner::baselineDiff($current, $baseline)['grown']);
        $this->assertNotEmpty(CACitationScanner::baselineDiff($current, $baseline)['shrunk']);
    }

    /**
     * Every stub shape the scanner claims to catch must be caught, and a real
     * citation (an existing path and line) must clear it.
     *
     * @param  list<string>  $lines
     * @param  int  $expected
     */
    #[DataProvider('stubShapes')]
    public function test_every_stub_shape_is_detected(array $lines, int $expected): void
    {
        $this->assertCount($expected, CACitationScanner::scanLines($lines, $this->fixtureIndex()));
    }

    /** A cited `views/X.vue` with 60 lines. */
    private function fixtureIndex(): array
    {
        return CACitationScanner::pathIndex([
            'packages/client-area/src/views/X.vue'."\t".'60',
            'packages/client-area/fm/src/http/get.js'."\t".'40',
        ]);
    }

    /**
     * @return array<string, array{0: list<string>, 1: int}>
     */
    public static function stubShapes(): array
    {
        return [
            'an uncited request' => [["\$this->getJson('/api/x');"], 1],
            'a cited request' => [["// CA: views/X.vue:10", "\$this->getJson('/api/x');"], 0],
            'a chain request on this' => [["\$this->actingAs(\$u)->putJson('/api/x', ['a' => 1]);"], 1],
            'a chain request with a citation' => [["// CA: views/X.vue:10-20", "\$this->actingAs(\$u)", "    ->putJson('/api/x', ['a' => 1]);"], 0],
            'a json request with a body' => [["\$this->json('POST', '/api/x', ['a' => 1]);"], 1],
            'a json read is not a request' => [["\$response->json('data');"], 0],
            'a json read chained on a request' => [["\$this->getJson('/api/x')->json('data');"], 1],
            'a client helper call is not a CA request' => [["\$this->client()->get('/projects/1');"], 0],
            'a chain through actingAs is a CA request' => [["\$this->actingAs(\$u)->getJson('/api/x');"], 1],
            'an uncited assertion' => [["->assertJson(['a' => 1]);"], 1],
            'a cited assertion' => [["// CA reads: views/X.vue:10", "->assertJson(['a' => 1]);"], 0],
            'assertJsonPath' => [["->assertJsonPath('data.a', 1);"], 1],
            'assertJsonStructure' => [["->assertJsonStructure(['data' => ['id']]);"], 1],
            'assertSee' => [["->assertSee('hello');"], 1],
            'assertStatus reads no key' => [["->assertStatus(200);"], 0],
            'a response variable assertion' => [["\$response->assertJson(['a' => 1]);"], 1],
            'a CA citation does not cite a read' => [["// CA: views/X.vue:10", "->assertJson(['a' => 1]);"], 1],
            'a CA reads citation does not cite a request' => [["// CA reads: views/X.vue:10", "\$this->getJson('/api/x');"], 1],
            'a bare file name is not a citation' => [["// CA: X.vue:10", "\$this->getJson('/api/x');"], 1],
            'a line beyond the file is not a citation' => [["// CA: views/X.vue:61", "\$this->getJson('/api/x');"], 1],
            'a citation inside a string is not a citation' => [["\$note = '// CA: views/X.vue:10';", "\$this->getJson('/api/x');"], 1],
            'a comment ending with a semicolon does not break the climb' => [[
                '// CA: views/X.vue:10 (a note; with a semicolon)',
                "\$this->actingAs(\$u)",
                "    ->getJson('/api/x');",
            ], 0],
            'an fm path resolves' => [["// CA: fm/src/http/get.js:40", "\$this->getJson('/api/x');"], 0],
            'an Engine stub is not a CA stub' => [["Http::response(['data' => []]);"], 0],
            'a made up path is not a citation' => [["// CA: views/Nope.vue:1", "\$this->getJson('/api/x');"], 1],
        ];
    }

    public function test_a_made_up_client_area_path_is_not_a_citation(): void
    {
        $offenders = CACitationScanner::scanLines(
            ['// CA: src/views/Nope.vue:12', "\$this->getJson('/api/x');"],
            $this->fixtureIndex(),
        );

        $this->assertCount(1, $offenders);
    }

    public function test_the_client_area_path_list_only_covers_src_and_fm(): void
    {
        $offenders = [];
        foreach (file(base_path('tests/Feature/Docs/client-area-paths.txt')) ?: [] as $line) {
            $path = explode("\t", trim($line))[0];
            if ($path === '') {
                continue;
            }
            if (! str_starts_with($path, 'packages/client-area/src/')
                && ! str_starts_with($path, 'packages/client-area/fm/')
            ) {
                $offenders[] = $path;
            }
        }

        $this->assertSame(
            [],
            $offenders,
            'client-area-paths.txt may only list src and fm files.',
        );
    }

    public function test_an_ambiguous_path_suffix_is_not_a_citation(): void
    {
        $client = CACitationScanner::pathIndex([
            'packages/client-area/src/A/X.vue'."\t".'9',
            'packages/client-area/fm/A/X.vue'."\t".'9',
        ]);

        $offenders = CACitationScanner::scanLines(
            ['// CA: A/X.vue:5', "\$this->getJson('/api/x');"],
            $client,
        );

        $this->assertCount(1, $offenders);
    }

    /**
     * @return array<string, array<string, int>> `tests/…/X.php` => normalised stub text => count
     */
    private function offenders(): array
    {
        $root = base_path('tests');
        $client = CACitationScanner::pathIndex($this->clientPaths());

        $offenders = [];
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root));
        foreach ($files as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }

            $relative = 'tests'.substr(str_replace('\\', '/', $file->getPathname()), strlen(str_replace('\\', '/', $root)));
            // The paid suite cites the Admin Area SPA (AdminAreaCitationGuardTest).
            if (in_array($relative, self::SKIP, true) || str_starts_with($relative, 'tests/Pro/')) {
                continue;
            }

            $lines = file($file->getPathname(), FILE_IGNORE_NEW_LINES) ?: [];
            $found = CACitationScanner::scanLines($lines, $client);
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
    private function clientPaths(): array
    {
        $path = base_path('tests/Feature/Docs/client-area-paths.txt');
        $this->assertFileExists($path, 'The committed Client Area path list is missing; run scripts/generate-client-area-paths.sh.');

        return array_values(array_filter(array_map('trim', file($path) ?: [])));
    }
}
