<?php

namespace Tests\Feature\Docs;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The old Client Area browser suite must be ported file-for-file
 * and method-for-method, keeping its class and method names, so the port can be
 * audited against the reference, a snapshot of the old suite
 * (`fixtures/old-dusk-client-area.json`).
 */
final class LegacyDuskPortTest extends TestCase
{
    private const PORT = 'tests/Browser/ClientArea';

    #[Test]
    public function test_every_reference_file_is_ported(): void
    {
        foreach (array_keys($this->reference()) as $relative) {
            $this->assertFileExists(
                base_path(self::PORT.'/'.$relative),
                "The reference Dusk file {$relative} was not ported."
            );
        }
    }

    #[Test]
    public function test_every_reference_test_method_is_ported_and_runnable(): void
    {
        foreach ($this->reference() as $relative => $file) {
            if (! str_ends_with($relative, 'Test.php')) {
                continue;
            }

            $ported = (string) file_get_contents(base_path(self::PORT.'/'.$relative));

            foreach ($file['methods'] as $method) {
                $this->assertMatchesRegularExpression(
                    '/public function '.preg_quote($method, '/').'\s*\(/',
                    $ported,
                    "{$relative}::{$method} was not ported."
                );
            }

            // Every ported method carries #[Test], so PHPUnit 12 (no doc-block
            // annotations) actually runs or skips it instead of dropping it.
            $this->assertSame(
                count($this->publicMethods($ported)),
                substr_count($ported, '#[Test]'),
                "{$relative} has a public test method without #[Test] ."
            );
        }
    }

    #[Test]
    public function test_every_reference_selector_is_kept(): void
    {
        foreach ($this->reference() as $relative => $file) {
            if (! str_ends_with($relative, 'Page.php')) {
                continue;
            }

            $ported = (string) file_get_contents(base_path(self::PORT.'/'.$relative));

            foreach ($file['selectors'] as $name => $selector) {
                $this->assertStringContainsString(
                    "'{$name}' => '{$selector}'",
                    $ported,
                    "{$relative} dropped the legacy selector {$name}."
                );
            }
        }
    }

    /**
     * The old Client Area Dusk files with their public methods and the
     * `@name => selector` pairs a page declares: a snapshot of
     * `packages/api/tests/Browser/ClientArea` (panelalpha/dev-api `bd4c9b53e`).
     *
     * @return array<string, array{methods: list<string>, selectors: array<string, string>}>
     */
    private function reference(): array
    {
        $decoded = json_decode((string) file_get_contents(__DIR__.'/fixtures/old-dusk-client-area.json'), true, flags: JSON_THROW_ON_ERROR);
        $this->assertIsArray($decoded);

        /** @var array<string, array{methods: list<string>, selectors: array<string, string>}> $decoded */
        return $decoded;
    }

    /**
     * @return list<string>
     */
    private function publicMethods(string $source): array
    {
        preg_match_all('/public function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/', $source, $matches);

        return array_values(array_unique($matches[1]));
    }
}
