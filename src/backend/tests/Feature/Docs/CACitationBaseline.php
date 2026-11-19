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
    public const OFFENDERS = [
];
}
