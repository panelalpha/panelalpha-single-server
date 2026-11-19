<?php

namespace Tests\Feature\Docs;

use PanelAlpha\StaticAnalysis\PackageDirectionRule;
use PHPStan\PhpDocParser\Lexer\Lexer;
use PHPStan\PhpDocParser\Parser\PhpDocParser;
use PHPStan\Rules\Rule;
use PHPStan\Testing\RuleTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * In `packages/engine-client/` the `PackageDirectionRule` must
 * catch, in every shape – names, string literals and docblock types – every
 * class of another `PanelAlpha\…` namespace (the controller, an edition, a
 * removed one) and of the host's `App\…`; the package's own names and
 * look-alike strings stay clean. In `packages/community/` the same
 * shapes must catch every host name and every `PanelAlpha\…` name outside the
 * Community package, the controller and the Engine client.
 *
 * The fixtures live under temporary package paths, because the rule pins each
 * package by **path**, not by a spoofable declared namespace.
 *
 * @extends RuleTestCase<PackageDirectionRule>
 */
final class PackageDirectionRuleTest extends RuleTestCase
{
    private string $root = '';

    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function getRule(): Rule
    {
        return new PackageDirectionRule(
            self::getContainer()->getByType(Lexer::class),
            self::getContainer()->getByType(PhpDocParser::class),
        );
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = sys_get_temp_dir().'/pa-package-direction-'.uniqid('', true);
        mkdir($this->root.'/packages/client-area', 0777, true);
        mkdir($this->root.'/packages/engine-client/src', 0777, true);
        mkdir($this->root.'/packages/community/src', 0777, true);
        mkdir($this->root.'/packages/hub/src', 0777, true);
        mkdir($this->root.'/app', 0777, true);
    }

    protected function tearDown(): void
    {
        $this->temporaryFiles = [];
        $this->removeTree($this->root);
        parent::tearDown();
    }

    private function removeTree(string $path): void
    {
        if (is_dir($path) && ! is_link($path)) {
            foreach ((array) scandir($path) as $entry) {
                if ($entry !== '.' && $entry !== '..' && is_string($entry)) {
                    $this->removeTree($path.'/'.$entry);
                }
            }
            @rmdir($path);

            return;
        }

        @unlink($path);
    }

    /**
     * One panel or host reference per case, with the class name
     * the message must carry; every reference carries a `/*MARK*` comment.
     *
     * @return array<string, array{0: string, 1: string|list<string>}>
     */
    public static function engineClientShapes(): array
    {
        $model = 'PanelAlpha\\ClientArea\\Models\\Application';
        $legacy = 'PanelAlpha\\ClientAreaLegacy\\Models\\DeployLog';
        $host = 'App\\Models\\User';
        $edition = 'PanelAlpha\\Edition\\Pro\\RoleBasedAccessResolver';
        $old = 'PanelAlpha\\UserApplication\\Models\\Application';

        return [
            'a use import' => ["<?php\n\nuse PanelAlpha\\ClientArea\\Models\\Application; /*MARK*/\n", $model],
            'a grouped use import' => [
                "<?php\n\nuse PanelAlpha\\ClientArea\\Models\\{Application, WordPressAsyncStatus}; /*MARK*/\n",
                // The group's prefix names the panel namespace itself.
                ['PanelAlpha\\ClientArea\\Models', $model, 'PanelAlpha\\ClientArea\\Models\\WordPressAsyncStatus'],
            ],
            'an aliased import and its use' => [
                "<?php\n\nuse PanelAlpha\\ClientArea\\Models\\Application as Mirror; /*MARK*/\n\nMirror::query(); /*MARK*/\n",
                $model,
            ],
            'a fully qualified static call' => ["<?php\n\n\\PanelAlpha\\ClientArea\\Models\\Application::query(); /*MARK*/\n", $model],
            'a ::class constant' => ["<?php\n\n\$x = \\PanelAlpha\\ClientArea\\Models\\Application::class; /*MARK*/\n", $model],
            'a static property fetch' => ["<?php\n\n\$x = \\PanelAlpha\\ClientArea\\Models\\Application::\$bar; /*MARK*/\n", $model],
            'a new expression' => ["<?php\n\nnew \\PanelAlpha\\ClientArea\\Models\\Application(); /*MARK*/\n", $model],
            'an instanceof' => [
                "<?php\n\n\$x = null;\nvar_dump(\$x instanceof \\PanelAlpha\\ClientArea\\Models\\Application); /*MARK*/\n",
                $model,
            ],
            'a parameter type' => ["<?php\n\nfunction f(\\PanelAlpha\\ClientArea\\Models\\Application \$x): void {} /*MARK*/\n", $model],
            'a return type' => ["<?php\n\nfunction f(): \\PanelAlpha\\ClientArea\\Models\\Application {} /*MARK*/\n", $model],
            'a property type' => [
                "<?php\n\nclass A\n{\n    public \\PanelAlpha\\ClientArea\\Models\\Application \$x; /*MARK*/\n}\n",
                $model,
            ],
            'a catch type' => ["<?php\n\ntry {\n} catch (\\PanelAlpha\\ClientArea\\Models\\Application \$e) { /*MARK*/\n}\n", $model],
            'a class extends' => ["<?php\n\nclass A extends \\PanelAlpha\\ClientArea\\Models\\Application {} /*MARK*/\n", $model],
            'a class implements' => ["<?php\n\nclass A implements \\PanelAlpha\\ClientArea\\Models\\Application {} /*MARK*/\n", $model],
            'a trait use' => ["<?php\n\nclass A\n{\n    use \\PanelAlpha\\ClientArea\\Models\\Application; /*MARK*/\n}\n", $model],
            'a class-string literal' => ["<?php\n\n\$x = 'PanelAlpha\\ClientArea\\Models\\Application'; /*MARK*/\n", $model],
            'a class name inside a longer string' => [
                "<?php\n\n\$x = 'model PanelAlpha\\\\ClientArea\\\\Models\\\\Application@find'; /*MARK*/\n",
                $model,
            ],
            'a fully qualified @var docblock' => [
                "<?php\n\nclass A\n{\n    /** @var \\PanelAlpha\\ClientArea\\Models\\Application */\n    public \$x; /*MARK*/\n}\n",
                $model,
            ],
            'a written-out @see docblock' => [
                "<?php\n\n/** @see \\PanelAlpha\\ClientArea\\Models\\Application::engineProject() */\nclass A {} /*MARK*/\n",
                $model,
            ],
            'an imported @param docblock' => [
                "<?php\n\nnamespace PanelAlpha\\EngineClient\\Api;\n\n"
                ."use PanelAlpha\\ClientArea\\Models\\Application as Mirror; /*MARK*/\n\n"
                ."/**\n * @param  Mirror  \$x\n */\nfunction f(\$x): void {} /*MARK*/\n",
                $model,
            ],
            'a legacy use import' => ["<?php\n\nuse PanelAlpha\\ClientAreaLegacy\\Models\\DeployLog; /*MARK*/\n", $legacy],
            'a legacy class-string literal' => ["<?php\n\n\$x = 'PanelAlpha\\ClientAreaLegacy\\Models\\DeployLog'; /*MARK*/\n", $legacy],
            'a host use import' => ["<?php\n\nuse App\\Models\\User; /*MARK*/\n", $host],
            'a host new expression' => ["<?php\n\nnew \\App\\Models\\User(); /*MARK*/\n", $host],
            'a host class-string literal' => ["<?php\n\n\$x = 'App\\Models\\User'; /*MARK*/\n", $host],
            'a host @return docblock' => ["<?php\n\n/**\n * @return \\App\\Models\\User\n */\nfunction f() {} /*MARK*/\n", $host],
            'an edition use import' => ["<?php\n\nuse PanelAlpha\\Edition\\Pro\\RoleBasedAccessResolver; /*MARK*/\n", $edition],
            'a pre-P1 static call' => ["<?php\n\n\\PanelAlpha\\UserApplication\\Models\\Application::query(); /*MARK*/\n", $old],
        ];
    }

    /**
     * @param  string|list<string>  $classes
     */
    #[DataProvider('engineClientShapes')]
    public function test_every_engine_client_shape_reports_an_error(string $code, string|array $classes): void
    {
        $expected = [];
        foreach ($this->markedLines($code) as $line) {
            foreach ((array) $classes as $class) {
                $expected[] = [sprintf(PackageDirectionRule::ENGINE_CLIENT_MESSAGE, $class), $line];
            }
        }

        $this->analyse([$this->engineClientFile($code)], $expected);
    }

    /**
     * The package's own names, the framework, global functions
     * and strings that only look like a panel name stay clean.
     */
    public function test_the_engine_client_own_shapes_are_clean(): void
    {
        $code = "<?php\n\nnamespace PanelAlpha\\EngineClient\\Api;\n\n"
            ."use Illuminate\\Http\\Client\\Response;\n"
            ."use PanelAlpha\\EngineClient\\EngineProject;\n"
            ."use PanelAlpha\\EngineClient\\Exceptions\\{EngineRequestException, ProjectProtectedException};\n\n"
            ."/**\n * Talks to the Engine for the Client Area (prose names no class); see\n"
            ." * \\PanelAlpha\\EngineClient\\EngineClient and Support\\EngineErrors.\n */\n"
            ."final class SampleApi\n{\n"
            ."    /**\n     * @param  EngineProject  \$project\n     * @return Response|null\n     */\n"
            ."    public function run(EngineProject \$project): ?Response\n    {\n"
            ."        \$own = 'PanelAlpha\\EngineClient\\Api\\ProjectsApi';\n"
            ."        \$prefix = 'PanelAlpha\\\\';\n"
            ."        \$similar = 'Application\\Models\\User';\n"
            ."        \$inside = 'NotPanelAlpha\\ClientArea\\Foo';\n"
            ."        \$word = 'App';\n"
            ."        \$timeout = (int) config('engine.timeout');\n"
            ."        app(EngineRequestException::class);\n"
            ."        if (\$project->protected) {\n            throw new ProjectProtectedException(\$own.\$prefix.\$similar.\$inside.\$word.\$timeout);\n        }\n\n"
            ."        return null;\n"
            ."    }\n}\n";

        $this->analyse([$this->engineClientFile($code)], []);
    }

    /**
     * The engine-client check applies to that package only: the host and the
     * controller may name `App\…` and their own classes.
     */
    public function test_a_panel_reference_outside_the_engine_client_is_not_flagged(): void
    {
        $app = $this->fileAt('app/Foo.php', "<?php\n\nuse App\\Models\\User;\nuse PanelAlpha\\ClientArea\\Models\\Application;\n\n\$x = 'App\\Models\\User';\n");
        $controller = $this->controllerFile("<?php\n\nuse App\\Models\\User;\nuse PanelAlpha\\ClientArea\\Models\\Application;\n\n\$x = 'App\\Models\\User';\n");

        $this->analyse([$app, $controller], []);
    }

    public function test_the_engine_client_path_and_namespace_are_pinned(): void
    {
        $this->assertSame(['/packages/engine-client/'], PackageDirectionRule::ENGINE_CLIENT_PATH_SEGMENTS);
        $this->assertSame('PanelAlpha\\EngineClient', PackageDirectionRule::ENGINE_CLIENT_NAMESPACE);
    }

    /**
     * The Community package may name the controller, the Engine client and its own
     * classes, never the host (`App\\…`) or another `PanelAlpha\\…` namespace.
     *
     * @return array<string, array{string, string}>
     */
    public static function communityShapes(): array
    {
        return [
            'a host ::class reference' => ["<?php\n\n\$x = \\App\\Models\\User::class; /*MARK*/\n", 'App\\Models\\User'],
            'a host extends' => ["<?php\n\nclass A extends \\App\\Models\\User {} /*MARK*/\n", 'App\\Models\\User'],
            'a legacy class-string literal' => ["<?php\n\n\$x = 'PanelAlpha\\ClientAreaLegacy\\Models\\DeployLog'; /*MARK*/\n", 'PanelAlpha\\ClientAreaLegacy\\Models\\DeployLog'],
            'a legacy @param docblock' => ["<?php\n\n/**\n * @param \\PanelAlpha\\ClientAreaLegacy\\Models\\DeployLog \$d\n */\nfunction f(\$d) {} /*MARK*/\n", 'PanelAlpha\\ClientAreaLegacy\\Models\\DeployLog'],
            'a host use import' => ["<?php\n\nuse App\\Models\\User; /*MARK*/\n", 'App\\Models\\User'],
            'a host class-string literal' => ["<?php\n\n\$x = 'App\\Models\\User'; /*MARK*/\n", 'App\\Models\\User'],
            'a host @return docblock' => ["<?php\n\n/**\n * @return \\App\\Models\\User\n */\nfunction f() {} /*MARK*/\n", 'App\\Models\\User'],
            'a legacy use import' => ["<?php\n\nuse PanelAlpha\\ClientAreaLegacy\\Models\\DeployLog; /*MARK*/\n", 'PanelAlpha\\ClientAreaLegacy\\Models\\DeployLog'],
            'a pre-P1 static call' => ["<?php\n\n\\PanelAlpha\\UserApplication\\Models\\Application::query(); /*MARK*/\n", 'PanelAlpha\\UserApplication\\Models\\Application'],
            'an edition use import' => ["<?php\n\nuse PanelAlpha\\Edition\\Pro\\RoleBasedAccessResolver; /*MARK*/\n", 'PanelAlpha\\Edition\\Pro\\RoleBasedAccessResolver'],
        ];
    }

    #[DataProvider('communityShapes')]
    public function test_every_community_package_shape_reports_an_error(string $code, string $class): void
    {
        $expected = [];
        foreach ($this->markedLines($code) as $line) {
            $expected[] = [sprintf(PackageDirectionRule::COMMUNITY_MESSAGE, $class), $line];
        }

        $this->analyse([$this->communityFile($code)], $expected);
    }

    public function test_the_community_package_own_and_allowed_names_are_clean(): void
    {
        $code = "<?php\n\nnamespace PanelAlpha\\Community\\Setup;\n\n"
            ."use Illuminate\\Http\\Request;\n"
            ."use PanelAlpha\\ClientArea\\Models\\Application;\n"
            ."use PanelAlpha\\Community\\Contracts\\SetupState;\n"
            ."use PanelAlpha\\EngineClient\\Contracts\\EngineResolver;\n\n"
            ."final class Sample\n{\n"
            ."    public function run(Request \$r, Application \$a, SetupState \$s, EngineResolver \$e): string\n    {\n"
            ."        \$word = 'App';\n"
            ."        return \$word.'Application\\Models\\User';\n"
            ."    }\n}\n";

        $this->analyse([$this->communityFile($code)], []);
    }

    public function test_the_community_path_and_namespaces_are_pinned(): void
    {
        $this->assertSame(['/packages/community/'], PackageDirectionRule::COMMUNITY_PATH_SEGMENTS);
        $this->assertSame(
            ['PanelAlpha\\Community', 'PanelAlpha\\ClientArea', 'PanelAlpha\\EngineClient', 'PanelAlpha\\Hub'],
            PackageDirectionRule::COMMUNITY_ALLOWED_NAMESPACES,
        );
    }

    /**
     * The Hub package knows the Hub and nothing about the panel: a controller,
     * Engine client, edition or host name is reported; its own names are not.
     */
    public function test_the_hub_package_names_no_panel_or_host_class(): void
    {
        $code = "<?php\n\nnamespace PanelAlpha\\Hub;\n\n"
            ."use PanelAlpha\\Hub\\Contracts\\HubPanel;\n"
            ."use PanelAlpha\\ClientArea\\Contracts\\PanelSettings; /*MARK*/\n"
            ."use PanelAlpha\\EngineClient\\Support\\Payload; /*MARK*/\n"
            ."use App\\Models\\User; /*MARK*/\n\n"
            ."final class Fixture\n{\n    public function run(HubPanel \$panel): void {}\n}\n";
        $classes = ['PanelAlpha\\ClientArea\\Contracts\\PanelSettings', 'PanelAlpha\\EngineClient\\Support\\Payload', 'App\\Models\\User'];
        $expected = [];
        foreach ($this->markedLines($code) as $index => $line) {
            $expected[] = [sprintf(PackageDirectionRule::HUB_MESSAGE, $classes[$index]), $line];
        }

        $this->analyse([$this->fileAt('packages/hub/src/Fixture.php', $code)], $expected);
        $this->assertSame(['/packages/hub/'], PackageDirectionRule::HUB_PATH_SEGMENTS);
        $this->assertSame('PanelAlpha\\Hub', PackageDirectionRule::HUB_NAMESPACE);
    }

    private function communityFile(string $code): string
    {
        return $this->fileAt('packages/community/src/Fixture.php', $code);
    }

    private function engineClientFile(string $code): string
    {
        return $this->fileAt('packages/engine-client/src/Fixture.php', $code);
    }

    private function controllerFile(string $code): string
    {
        return $this->fileAt('packages/client-area/Fixture.php', $code);
    }

    private function fileAt(string $relative, string $code): string
    {
        $file = $this->root.'/'.$relative;
        file_put_contents($file, $code);
        $this->temporaryFiles[] = $file;

        return $file;
    }

    /**
     * @return list<int>
     */
    private function markedLines(string $code): array
    {
        $lines = [];
        foreach (explode("\n", $code) as $index => $line) {
            if (str_contains($line, '/*MARK*/')) {
                $lines[] = $index + 1;
            }
        }

        $this->assertNotSame([], $lines, 'The fixture must carry a /*MARK*/ comment on every offending line.');

        return $lines;
    }
}
