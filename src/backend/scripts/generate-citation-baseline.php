<?php

declare(strict_types=1);

/**
 * Regenerates tests/Feature/Docs/EngineCitationBaseline.php by scanning a tests
 * tree.
 *
 * The committed baseline must stay the offender set of the `ea7c307` snapshot:
 *
 *   git archive ea7c307 src/backend/tests | tar -x -C /tmp/ea7c307-tests
 *   php scripts/generate-citation-baseline.php /tmp/ea7c307-tests/app/backend/tests
 *
 * The baseline may only shrink. Never regenerate it upward from a newer tree.
 *
 * Run inside the test container so the scanner autoload is not needed:
 *   docker run --rm -v $PWD:/app -w /app composer:2 php scripts/generate-citation-baseline.php <tests-root>
 */

require __DIR__.'/../tests/Feature/Docs/EngineCitationScanner.php';

use Tests\Feature\Docs\EngineCitationScanner;

$root = $argv[1] ?? null;
if ($root === null || ! is_dir($root)) {
    fwrite(STDERR, "usage: php scripts/generate-citation-baseline.php <tests-root>\n");
    exit(1);
}

$enginePaths = EngineCitationScanner::pathIndex(
    array_values(array_filter(array_map('trim', file(__DIR__.'/../tests/Feature/Docs/engine-paths.txt') ?: [])))
);

$skip = [
    'Feature/Docs/EngineCitationBaseline.php',
    'Feature/Docs/EngineCitationGuardTest.php',
    'Feature/Docs/EngineCitationScanner.php',
];

$offenders = [];
$iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root));
foreach ($iterator as $file) {
    if (! $file->isFile() || $file->getExtension() !== 'php') {
        continue;
    }
    $relative = 'tests'.substr($file->getPathname(), strlen($root));
    $short = substr($relative, strlen('tests/'));
    if (in_array($short, $skip, true)) {
        continue;
    }

    $lines = file($file->getPathname(), FILE_IGNORE_NEW_LINES) ?: [];
    $found = EngineCitationScanner::scanLines($lines, $enginePaths);
    if ($found !== []) {
        ksort($found);
        $offenders[$relative] = $found;
    }
}

ksort($offenders);

$export = var_export($offenders, true);
$export = preg_replace('/^array \($/m', '[', (string) $export);
$export = preg_replace('/^\)$/m', ']', (string) $export);
// var_export array entries as `key => value`; PHP 8.5 accepts the short syntax.

$out = <<<PHP
<?php

namespace Tests\Feature\Docs;

/**
 * Uncited Engine stubs per test file, keyed by normalised stub text. The counts
 * are the offender set of the `ea7c307` snapshot and may only shrink: {@see EngineCitationGuardTest} fails
 * when a file gains an uncited stub and when a file loses one without its entry
 * here being lowered. Regenerate with `scripts/generate-citation-baseline.php`
 * against the `ea7c307` tree only.
 */
final class EngineCitationBaseline
{
    /** @var array<string, array<string, positive-int>> */
    public const OFFENDERS = {$export};
}

PHP;

file_put_contents(__DIR__.'/../tests/Feature/Docs/EngineCitationBaseline.php', $out);
echo 'wrote '.array_sum(array_map('array_sum', $offenders))." offenders in ".count($offenders)." files\n";
