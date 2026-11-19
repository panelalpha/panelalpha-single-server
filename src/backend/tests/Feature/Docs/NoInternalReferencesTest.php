<?php

namespace Tests\Feature\Docs;

use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * The repository is published, so its comments and docs explain themselves:
 * no file names the team's internal reviews, decision documents or tracker
 * issues, which a reader of the public copy cannot open. A reason belongs in
 * the comment itself.
 */
final class NoInternalReferencesTest extends TestCase
{
    /** What points into the internal tracking. */
    private const PATTERN = '/\b[Rr]eview \d+\b'
        .'|\b(?:agent-brief|admin-area-agent-brief|admin-area-migration|admin-api-migration|client-api-migration|intended-differences|engine-gaps|package-split-plan|migration-tasks|engine-requirements|live-api-tests)(?:\.md)?\b'
        .'|\barchitecture(?:\.md)? §'
        .'|\bdocs\/reviews\b'
        .'|(?<![\w\/-])(?:panelalpha\/)?(?:panel\/)?base#\d+\b'
        .'|\b[Ll]ead decision\b/';

    /** Tracked files that are not prose: generated path lists and recorded API documents. */
    private const SKIPPED = [
        '#\.txt$#',
        '#/openapi-[\d.]+\.json$#',
        '#^src/frontend/#',
        // This test's own examples.
        '#/NoInternalReferencesTest\.php$#',
    ];

    public function test_the_pattern_finds_each_kind_of_reference(): void
    {
        foreach ([
            'the cleanup (review 18 G10)',
            'see architecture §4.7',
            'agent-brief.md §8',
            'Refs panel/base#282',
            'a lead decision of 2026-10-30',
            'the docs/reviews folder',
        ] as $line) {
            $this->assertSame(1, preg_match(self::PATTERN, $line), $line);
        }
        foreach ([
            'hub-connect-contract.md §3',
            'core/app/Rules/FreeMainDomain.php:28',
            'review the domain before saving',
            'https://github.com/laravel/framework#123',
        ] as $line) {
            $this->assertSame(0, preg_match(self::PATTERN, $line), $line);
        }
    }

    public function test_no_tracked_file_names_an_internal_reference(): void
    {
        $root = dirname(base_path(), 2);
        $process = new Process(['git', 'ls-files', '-z'], $root);
        $process->run();
        if (! $process->isSuccessful()) {
            $this->markTestSkipped('not a git checkout');
        }

        $offenders = [];
        foreach (array_filter(explode("\0", $process->getOutput())) as $path) {
            foreach (self::SKIPPED as $skipped) {
                if (preg_match($skipped, $path) === 1) {
                    continue 2;
                }
            }
            $file = $root.'/'.$path;
            if (! is_file($file) || is_link($file)) {
                continue;
            }
            // A private block never reaches the public copy (Copybara drops it); blank it, keeping the line numbers.
            $text = (string) preg_replace_callback(
                '/^[ \t]*(?:#|\/\/) >{3} private[^\n]*\n(?:.*\n)*?[ \t]*(?:#|\/\/) <{3} private[^\n]*\n/m',
                static fn (array $block): string => str_repeat("\n", substr_count($block[0], "\n")),
                (string) file_get_contents($file),
            );
            foreach (preg_split('/\R/', $text) ?: [] as $number => $line) {
                if (preg_match(self::PATTERN, $line) === 1) {
                    $offenders[] = $path.':'.($number + 1).': '.trim($line);
                }
            }
        }

        $this->assertSame([], $offenders, "Name the reason, not an internal review, decision or issue:\n".implode("\n", $offenders));
    }
}
