<?php

namespace Tests\Feature\Docs;

use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use PanelAlpha\ClientArea\Contracts\PanelUser;
use Tests\TestCase;

/**
 * The V20 typing pass left two `use` statements with no
 * reference in their file. A runtime test cannot see an unused import, so this
 * static guard pins the exact `use` lines that must not come back.
 */
class StaleImportTest extends TestCase
{
    public function test_the_typing_pass_left_no_stale_imports(): void
    {
        // The import would be live if the class were referenced, so the guard
        // is scoped to these two files the review names.
        $stale = [
            base_path('../packages/client-area/src/Notifications/ApplicationNotifier.php') => PanelUser::class,
            base_path('tests/Feature/Account/DeviceTest.php') => ValidateCsrfToken::class,
        ];

        foreach ($stale as $path => $class) {
            $this->assertFileExists($path);
            $this->assertFalse(
                $this->importsClass((string) file_get_contents($path), $class),
                "{$path} imports the unused {$class} again.",
            );
        }
    }

    public function test_the_stale_import_scan_flags_a_fixture(): void
    {
        $this->assertTrue(
            $this->importsClass("<?php\n\nuse PanelAlpha\\ClientArea\\Contracts\\PanelUser;\n", PanelUser::class),
            'The scanner must flag a stale import.',
        );

        // A docblock that merely names the class is not an import.
        $this->assertFalse(
            $this->importsClass("<?php\n\n/** PanelUser is not imported here. */\n", PanelUser::class),
            'A docblock mention must not count as an import.',
        );
    }

    /**
     * True when the code has a top-level `use <fqcn>;` statement; comments are
     * blanked first so a docblock mention is not mistaken for one.
     */
    private function importsClass(string $code, string $fqcn): bool
    {
        $stripped = '';
        foreach (token_get_all($code) as $token) {
            if (is_array($token)) {
                $stripped .= in_array($token[0], [T_COMMENT, T_DOC_COMMENT], true) ? '' : $token[1];

                continue;
            }

            $stripped .= $token;
        }

        return preg_match('/^\s*use\s+'.preg_quote($fqcn, '/').'\s*;/m', $stripped) === 1;
    }
}
