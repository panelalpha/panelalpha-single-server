<?php

namespace Tests\Feature\Docs;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Dusk is a dev-only dependency and its suite lives outside the
 * hermetic gate. `php artisan test` reads phpunit.xml, which must not contain a
 * Browser testsuite, while `php artisan dusk` reads phpunit.dusk.xml.
 */
final class DuskConfigurationTest extends TestCase
{
    #[Test]
    public function test_laravel_dusk_is_a_dev_dependency(): void
    {
        $composer = json_decode((string) file_get_contents(base_path('composer.json')), true);
        $this->assertIsArray($composer);

        $this->assertArrayHasKey('laravel/dusk', $composer['require-dev'] ?? []);
        $this->assertArrayNotHasKey('laravel/dusk', $composer['require'] ?? []);
        $this->assertTrue(class_exists(\Laravel\Dusk\TestCase::class));
    }

    #[Test]
    public function test_the_gate_suite_does_not_include_browser_tests(): void
    {
        $phpunit = $this->configuration(base_path('phpunit.xml'));

        $this->assertNotContains('tests/Browser', $this->testDirectories($phpunit));
        $this->assertContains('tests/Unit', $this->testDirectories($phpunit));
        $this->assertContains('tests/Feature', $this->testDirectories($phpunit));
    }

    #[Test]
    public function test_the_dusk_suite_owns_the_browser_tests(): void
    {
        $this->assertFileExists(base_path('phpunit.dusk.xml'));

        $dusk = $this->configuration(base_path('phpunit.dusk.xml'));

        $this->assertContains('tests/Browser', $this->testDirectories($dusk));
    }

    /**
     * @return array<string, \SimpleXMLElement>
     */
    private function configuration(string $path): array
    {
        $xml = simplexml_load_string((string) file_get_contents($path));
        $this->assertInstanceOf(\SimpleXMLElement::class, $xml);

        $suites = [];
        foreach ($xml->testsuites->testsuite as $suite) {
            $suites[(string) $suite['name']] = $suite;
        }

        return $suites;
    }

    /**
     * @param  array<string, \SimpleXMLElement>  $suites
     * @return list<string>
     */
    private function testDirectories(array $suites): array
    {
        $directories = [];
        foreach ($suites as $suite) {
            foreach ($suite->directory as $directory) {
                $directories[] = trim((string) $directory);
            }
        }

        return $directories;
    }
}
