<?php

namespace Tests\Feature\Docs\EngineContract;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use Tests\Feature\ClientArea\EngineFixtures;

/**
 * Engine fakes against Engine 2.3.0 (stage 3, area 10). Every Engine answer a
 * test fakes is placed on its operation in `openapi-2.3.0.json` by method and
 * path, and its status and body are checked against the documented answer.
 * A difference is allowed only when `known-gaps.php` lists it, and a listed
 * difference that no longer happens fails the test.
 */
final class EngineContractTest extends TestCase
{
    private const CATEGORIES = ['fake-outdated', 'spec-gap', 'intended'];

    /** @var array{checked: int, operations: array<string, true>, differences: array<string, list<string>>, skipped: array<string, int>}|null */
    private static ?array $result = null;

    public function test_every_fixture_builder_is_placed_on_an_operation(): void
    {
        $builders = [];
        foreach ((new ReflectionClass(EngineFixtures::class))->getMethods() as $method) {
            if (preg_match('/^engine[A-Z]/', $method->getName()) === 1) {
                $builders[] = $method->getName();
            }
        }
        sort($builders);
        $listed = FixtureHarness::BUILDERS;
        sort($listed);

        $this->assertSame($listed, $builders, 'EngineFixtures has a new engine*() builder: add it to FixtureHarness and FixtureCatalog.');

        $catalogued = array_unique(array_map(static fn (array $fake): string => explode('::', $fake['file'])[1], FixtureCatalog::fakes()));
        $this->assertSame($listed, array_values(array_intersect($listed, $catalogued)), 'A builder is missing from FixtureCatalog.');
    }

    public function test_fakes_match_engine_2_3_0_except_known_gaps(): void
    {
        $result = self::scan();
        $known = $this->knownGaps();

        $new = [];
        foreach ($result['differences'] as $signature => $sources) {
            if (! isset($known[$signature])) {
                $new[] = $signature.'  <- '.implode(', ', array_slice($sources, 0, 3));
            }
        }
        $this->assertSame([], $new, "New differences from Engine 2.3.0. Fix the fake, or list the difference in known-gaps.php with a reason:\n".implode("\n", $new));
    }

    public function test_known_gaps_that_no_longer_happen_are_removed(): void
    {
        $result = self::scan();
        $stale = array_keys(array_diff_key($this->knownGaps(), $result['differences']));

        $this->assertSame([], $stale, "These known-gaps.php entries no longer happen; remove them:\n".implode("\n", $stale));
    }

    public function test_known_gaps_have_a_category_and_a_reason(): void
    {
        foreach ($this->knownGaps() as $signature => $gap) {
            $this->assertContains($gap['category'] ?? null, self::CATEGORIES, $signature);
            $this->assertNotSame('', trim((string) ($gap['reason'] ?? '')), $signature);
        }
    }

    public function test_the_guard_checks_a_real_amount_of_answers(): void
    {
        $result = self::scan();

        $this->assertGreaterThan(300, OpenApiSpec::load()->operationCount());
        $this->assertGreaterThan(50, $result['checked']);
        $this->assertGreaterThan(15, count($result['operations']));
    }

    /**
     * @return array<string, array{category: string, reason: string}>
     */
    private function knownGaps(): array
    {
        return require __DIR__.'/known-gaps.php';
    }

    /**
     * @return array{checked: int, operations: array<string, true>, differences: array<string, list<string>>, skipped: array<string, int>}
     */
    public static function scan(): array
    {
        if (self::$result !== null) {
            return self::$result;
        }

        $fakes = FixtureCatalog::fakes();
        $skipped = [];
        $extractor = new FakeExtractor();
        $root = dirname(__DIR__, 3);
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, RecursiveDirectoryIterator::SKIP_DOTS));
        $paths = [];
        foreach ($files as $file) {
            $path = $file->getPathname();
            if (! str_ends_with($path, '.php') || str_contains($path, '/Feature/Docs/')) {
                continue;
            }
            $paths[] = $path;
        }
        sort($paths);
        foreach ($paths as $path) {
            $found = $extractor->extract($path, substr($path, strlen($root) + 1));
            $fakes = array_merge($fakes, $found['fakes']);
            foreach ($found['skipped'] as $reason => $count) {
                $skipped[$reason] = ($skipped[$reason] ?? 0) + $count;
            }
        }

        $spec = OpenApiSpec::load();
        $validator = new SchemaValidator($spec);
        $operations = [];
        $differences = [];
        foreach ($fakes as $fake) {
            $source = $fake['file'].($fake['line'] > 0 ? ':'.$fake['line'] : '');
            [$operation, $found] = self::place($spec, $validator, $fake);
            if ($operation !== null) {
                $operations[$operation] = true;
            }
            foreach ($found as $signature) {
                $differences[$signature][] = $source;
            }
        }
        ksort($differences);

        return self::$result = ['checked' => count($fakes), 'operations' => $operations, 'differences' => $differences, 'skipped' => $skipped];
    }

    /**
     * Statuses any route can answer, so the document does not list them per
     * operation: authentication (401) and server failures (5xx).
     */
    private static function isGenericStatus(int $status): bool
    {
        return $status === 401 || $status >= 500;
    }

    /**
     * @param  array{file: string, line: int, method: ?string, path: string, status: int, body: mixed, json: bool}  $fake
     * @return array{0: ?string, 1: list<string>}  the operation (`METHOD /spec/path`) and the differences
     */
    private static function place(OpenApiSpec $spec, SchemaValidator $validator, array $fake): array
    {
        $candidates = $spec->candidates($fake['method'], $fake['path']);
        $label = ($fake['method'] ?? '?').' '.$fake['path'].' '.$fake['status'];
        if ($candidates === []) {
            return [null, [$label.' (body): no-operation']];
        }

        $best = null;
        foreach ($candidates as $candidate) {
            $name = $candidate['method'].' '.$candidate['path'];
            $prefix = $name.' '.$fake['status'].' ';
            if (! $spec->hasStatus($candidate['operation'], $fake['status']) && ! self::isGenericStatus($fake['status'])) {
                $found = [$prefix.'(body): status-not-documented'];
                $rank = 2;
            } else {
                $schema = $spec->responseSchema($candidate['operation'], $fake['status']);
                $found = [];
                if ($fake['json'] && $schema !== null) {
                    foreach ($validator->validate($schema, $fake['body']) as $difference) {
                        $found[] = $prefix.$difference;
                    }
                }
                $rank = $found === [] ? 0 : 1;
            }
            if ($best === null || [$rank, count($found)] < [$best[0], count(is_array($best[2]) ? $best[2] : [])]) {
                $best = [$rank, $name, $found];
            }
            if ($rank === 0) {
                break;
            }
        }

        // `Http::fake` keys carry no method, so with several operations on the
        // path and none fitting, the nearest one is a guess: say so.
        if ($best[0] > 0 && $fake['method'] === null && count($candidates) > 1) {
            [$method, $path] = explode(' ', $best[1], 2);
            $methods = implode('|', array_unique(array_map(static fn (array $candidate): string => $candidate['method'], $candidates)));
            $nearest = (string) preg_replace('#^'.preg_quote($best[1].' '.$fake['status'].' ', '#').'#', '', $best[2][0] ?? '');

            return [$best[1], [$path.' '.$fake['status'].' (body): fits-no-operation ('.$methods.'); nearest '.$method.': '.$nearest]];
        }

        return [$best[1], $best[2]];
    }
}
