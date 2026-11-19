<?php

declare(strict_types=1);

/**
 * Regenerates tests/Feature/Docs/CACitationBaseline.php by scanning a tests tree
 * for uncited Client Area request/reads stubs.
 *
 * The committed baseline is the offender set of the `v1/r8-a` start
 * tree and may only shrink: never regenerate it upward from a newer tree.
 *
 * Run inside the test container with the Client Area path list present:
 *   docker run --rm -v $PWD:/app -w /app composer:2 php scripts/generate-ca-citation-baseline.php [tests-root]
 */

require __DIR__.'/../tests/Feature/Docs/CACitationScanner.php';

use Tests\Feature\Docs\CACitationScanner;

$root = $argv[1] ?? __DIR__.'/../tests';
if (! is_dir($root)) {
    fwrite(STDERR, "usage: php scripts/generate-ca-citation-baseline.php [tests-root]\n");
    exit(1);
}

$client = CACitationScanner::pathIndex(
    array_values(array_filter(array_map('trim', file(__DIR__.'/../tests/Feature/Docs/client-area-paths.txt') ?: [])))
);

$skip = [
    'Feature/Docs/CACitationBaseline.php',
    'Feature/Docs/CACitationGuardTest.php',
    'Feature/Docs/CACitationScanner.php',
];

$offenders = [];
$iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root));
foreach ($iterator as $file) {
    if (! $file->isFile() || $file->getExtension() !== 'php') {
        continue;
    }
    $relative = 'tests'.substr(str_replace('\\', '/', $file->getPathname()), strlen(str_replace('\\', '/', $root)));
    $short = substr($relative, strlen('tests/'));
    if (in_array($short, $skip, true)) {
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

$export = var_export($offenders, true);
$export = (string) preg_replace('/^array \($/m', '[', $export);
$export = (string) preg_replace('/^\)$/m', ']', $export);

$out = <<<PHP
<?php

namespace Tests\Feature\Docs;

/**
 * Uncited Client Area request/reads stubs per test file, keyed by normalised stub
 * text. The counts are the offender set of the `v1/r8-a`
 * start tree and may only shrink: {@see CACitationGuardTest} fails when a file
 * gains an uncited stub and when a file loses one without its entry here being
 * lowered. Every area's fix commit cites its stubs and lowers the matching
 * entries. Regenerate with `scripts/generate-ca-citation-baseline.php` against
 * the start tree only.
 */
final class CACitationBaseline
{
    /** @var array<string, array<string, positive-int>> */
    public const OFFENDERS = {$export};
}

PHP;

file_put_contents(__DIR__.'/../tests/Feature/Docs/CACitationBaseline.php', $out);
echo 'wrote '.array_sum(array_map('array_sum', $offenders))." offenders in ".count($offenders)." files\n";
