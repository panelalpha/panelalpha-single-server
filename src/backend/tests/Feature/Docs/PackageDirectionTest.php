<?php

namespace Tests\Feature\Docs;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * The `PackageDirectionRule` is the AST half of the dependency-direction guard;
 * this test pins the other two halves – the Composer requirements and a text
 * scan of the controller package – plus the edition boundary.
 *
 * Every `edition-*` package depends on the controller alone; `engine-client` requires no `panelalpha/*` package
 *The Community answers are the controller's own defaults.
 *
 * The paid packages: `edition-pro`
 * is an edition; `admin-area-controller` requires the controller, the Engine
 * client and `edition-pro`. No Community package and no host code names a paid
 * namespace – the Community product does not even install them (ProductSplitTest).
 */
final class PackageDirectionTest extends TestCase
{
    use PaidPackages;

    private const CONTROLLER_PACKAGE = '../packages/client-area';

    /**
     * What an edition may require: the controller, and optionally the Engine
     * client (Multi implements its `EngineResolver`). Multi also builds on the
     * paid edition's `engines`, `plans` and `services` (`edition-multi`
     * depends on `edition-pro`), so `edition-pro` is the
     * one edition an edition may require. Never legacy or another edition (the
     * rule was extended when Multi was built).
     */
    private const EDITION_REQUIRES = [
        ['panelalpha/client-area'],
        ['panelalpha/client-area', 'panelalpha/engine-client'],
        ['panelalpha/client-area', 'panelalpha/edition-pro', 'panelalpha/engine-client'],
    ];

    /**
     * `panelalpha/engine-client` knows the Engine and nothing
     * about the panel, so it requires no `panelalpha/*` package.
     */
    public function test_the_engine_client_requires_no_panel_package(): void
    {
        $this->assertSame([], $this->engineClientOffenders(base_path('../packages')));
    }

    /**
     * `panelalpha/hub` knows the Hub and nothing about the panel, so it requires
     * no `panelalpha/*` package; only the two products' packages require it.
     */
    public function test_the_hub_requires_no_panel_package_and_only_the_products_require_it(): void
    {
        $this->assertSame([], $this->panelalphaRequires($this->composer('../packages/hub/composer.json')));

        $requirers = [];
        foreach (glob(base_path('../packages/*/composer.json')) ?: [] as $file) {
            if (in_array('panelalpha/hub', $this->panelalphaRequires($this->composer('../packages/'.basename(dirname($file)).'/composer.json')), true)) {
                $requirers[] = basename(dirname($file));
            }
        }
        sort($requirers);
        $this->assertSame(array_values(array_filter(['admin-area-controller', 'community'], static fn (string $package): bool => ! in_array($package, self::$paidPackages, true) || self::paidPackageCheckedOut($package))), $requirers);
    }

    /**
     * The Engine client boundary on a fixture packages root – a
     * requirement of the controller, legacy or an edition, a missing or an
     * unreadable `composer.json` are reported; Laravel alone is not.
     */
    public function test_the_engine_client_boundary_catches_a_bypass(): void
    {
        $cases = [
            'controller' => [['panelalpha/client-area' => '*', 'laravel/framework' => '^13.0'], ['panelalpha/client-area']],
            'legacy' => [['panelalpha/client-area-legacy' => '*'], ['panelalpha/client-area-legacy']],
            'edition' => [['panelalpha/edition-pro' => '*'], ['panelalpha/edition-pro']],
            'laravel only' => [['php' => '^8.4', 'laravel/framework' => '^13.0'], []],
            'unreadable' => ['{not json', ['composer.json is not readable']],
            'missing' => [null, ['composer.json is not readable']],
        ];

        foreach ($cases as $case => [$require, $expected]) {
            $root = sys_get_temp_dir().'/engine-client-direction-'.bin2hex(random_bytes(6));
            mkdir($root.'/engine-client', 0777, true);

            try {
                if (is_array($require)) {
                    file_put_contents($root.'/engine-client/composer.json', (string) json_encode(['name' => 'panelalpha/engine-client', 'require' => $require]));
                } elseif (is_string($require)) {
                    file_put_contents($root.'/engine-client/composer.json', $require);
                }

                $this->assertSame($expected, $this->engineClientOffenders($root), $case);
            } finally {
                File::deleteDirectory($root);
            }
        }
    }

    /**
     * The Admin Area works on the Client Area mirror and the paid
     * edition's tables, and reaches the Engine through the Engine client.
     */
    public function test_the_admin_area_requires_the_controller_the_paid_edition_and_the_engine_client(): void
    {
        $this->skipWithoutPaidPackage('admin-area-controller');
        $composer = $this->composer('../packages/admin-area-controller/composer.json');

        $this->assertSame(
            ['panelalpha/client-area', 'panelalpha/edition-pro', 'panelalpha/engine-client', 'panelalpha/hub'],
            $this->panelalphaRequires($composer),
        );
    }

    /**
     * The paid packages depend on the Community ones, never the reverse. No Community
     * package and no host directory names `AdminAreaController` or `EditionPro`
     * (tests are exempt: the paid suite names them).
     */
    public function test_no_community_code_names_a_paid_package(): void
    {
        $roots = [
            '../packages/client-area',
            '../packages/engine-client',
            'app',
            'bootstrap',
            'config',
            'database',
            'routes',
        ];

        $offenders = [];
        foreach ($roots as $root) {
            foreach ($this->packageFiles($root) as $file) {
                // The generated provider caches of a paid install sit next to
                // the Community ones (bootstrap/vendor.php).
                if (str_contains($file, '/bootstrap/cache/')) {
                    continue;
                }
                $contents = (string) file_get_contents($file);
                if (str_contains($contents, 'AdminAreaController') || str_contains($contents, 'EditionPro')) {
                    $offenders[] = $file;
                }
            }
        }

        $this->assertSame([], $offenders, "Community code must not name a paid package:\n".implode("\n", $offenders));

        // The paid edition's code does not know the Admin Area either (its
        // `edition/` build files and its tests install and test the whole edition).
        foreach (self::paidPackageCheckedOut('edition-pro') ? $this->packageFiles('../packages/edition-pro') : [] as $file) {
            if (str_contains($file, '/edition-pro/edition/') || str_contains($file, '/edition-pro/tests/')) {
                continue;
            }
            $this->assertStringNotContainsString('AdminAreaController', (string) file_get_contents($file), $file);
        }
    }

    /**
     * The Community feature package builds on the controller and the Engine client
     * and never requires legacy or an edition.
     */
    public function test_the_community_package_requires_neither_legacy_nor_an_edition(): void
    {
        $this->assertSame([], $this->communityOffenders(base_path('../packages')));
    }

    public function test_the_community_boundary_counts_require_dev(): void
    {
        $root = sys_get_temp_dir().'/free-direction-'.bin2hex(random_bytes(6));
        mkdir($root.'/community', 0777, true);

        try {
            file_put_contents($root.'/community/composer.json', (string) json_encode([
                'name' => 'panelalpha/community',
                'require' => ['panelalpha/client-area' => '*'],
                'require-dev' => ['panelalpha/client-area-legacy' => '*'],
            ]));

            $this->assertSame(['panelalpha/client-area-legacy'], $this->communityOffenders($root));
        } finally {
            File::deleteDirectory($root);
        }
    }

    public function test_the_community_boundary_catches_a_bypass(): void
    {
        $cases = [
            'legacy' => [['panelalpha/client-area' => '*', 'panelalpha/client-area-legacy' => '*'], ['panelalpha/client-area-legacy']],
            'edition' => [['panelalpha/edition-pro' => '*'], ['panelalpha/edition-pro']],
            'clean' => [['panelalpha/client-area' => '*', 'panelalpha/engine-client' => '*'], []],
            'unreadable' => ['{not json', ['composer.json is not readable']],
            'missing' => [null, ['composer.json is not readable']],
        ];

        foreach ($cases as $case => [$require, $expected]) {
            $root = sys_get_temp_dir().'/free-direction-'.bin2hex(random_bytes(6));
            mkdir($root.'/community', 0777, true);

            try {
                if (is_array($require)) {
                    file_put_contents($root.'/community/composer.json', (string) json_encode(['name' => 'panelalpha/community', 'require' => $require]));
                } elseif (is_string($require)) {
                    file_put_contents($root.'/community/composer.json', $require);
                }

                $this->assertSame($expected, $this->communityOffenders($root), $case);
            } finally {
                File::deleteDirectory($root);
            }
        }
    }

    public function test_every_edition_package_requires_only_the_controller_and_the_engine_client(): void
    {
        // A paid edition submodule that is not checked out is an empty directory; it has nothing to check.
        $uninitialised = array_map('basename', array_filter(
            glob(base_path('../packages/edition-*'), GLOB_ONLYDIR) ?: [],
            static fn (string $directory): bool => count(scandir($directory) ?: []) <= 2,
        ));

        $this->assertSame([], array_values(array_diff($this->editionOffenders(base_path('../packages')), $uninitialised)));
    }

    /**
     * The Community answers are the controller's defaults, and the
     * only paid edition packages are Pro and Multi, so the edition boundary is
     * proven on a fixture
     * packages root: a future Pro package that requires legacy, another edition
     * or nothing readable is reported; one that requires the controller only,
     * and a non-edition package, are not.
     */
    public function test_the_edition_boundary_catches_a_bypass(): void
    {
        $root = sys_get_temp_dir().'/package-direction-'.bin2hex(random_bytes(6));
        $packages = [
            'edition-pro' => ['panelalpha/client-area' => '*', 'laravel/framework' => '^13.0'],
            'edition-engine' => ['panelalpha/client-area' => '*', 'panelalpha/engine-client' => '*'],
            'edition-engine-only' => ['panelalpha/engine-client' => '*'],
            'edition-legacy' => ['panelalpha/client-area' => '*', 'panelalpha/client-area-legacy' => '*'],
            // `edition-pro` is the one edition an edition may build on; a
            // sibling edition is still a bypass.
            'edition-multi' => ['panelalpha/client-area' => '*', 'panelalpha/edition-pro' => '*', 'panelalpha/engine-client' => '*'],
            'edition-sibling' => ['panelalpha/client-area' => '*', 'panelalpha/edition-core' => '*'],
            'edition-bare' => ['laravel/framework' => '^13.0'],
            'client-area-other' => ['panelalpha/client-area-legacy' => '*'],
        ];

        try {
            foreach ($packages as $name => $require) {
                mkdir($root.'/'.$name, 0777, true);
                file_put_contents($root.'/'.$name.'/composer.json', (string) json_encode(['name' => 'panelalpha/'.$name, 'require' => $require]));
            }
            mkdir($root.'/edition-unreadable', 0777, true);
            file_put_contents($root.'/edition-unreadable/composer.json', '{not json');
            mkdir($root.'/edition-empty', 0777, true);

            $this->assertSame(
                ['edition-bare', 'edition-empty', 'edition-engine-only', 'edition-legacy', 'edition-sibling', 'edition-unreadable'],
                $this->editionOffenders($root),
            );
        } finally {
            File::deleteDirectory($root);
        }
    }

    /**
     * Every `edition-*` directory under the packages root whose `composer.json`
     * is missing or requires any `panelalpha/*` package besides the controller.
     *
     * @return list<string>
     */
    private function editionOffenders(string $packagesRoot): array
    {
        $offenders = [];
        foreach (glob($packagesRoot.'/edition-*', GLOB_ONLYDIR) ?: [] as $directory) {
            // The Community feature package has its own boundary ({@see self::communityOffenders()}).
            if (basename($directory) === 'community') {
                continue;
            }
            $file = $directory.'/composer.json';
            $decoded = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
            if (! is_array($decoded) || ! in_array($this->panelalphaRequires($decoded), self::EDITION_REQUIRES, true)) {
                $offenders[] = basename($directory);
            }
        }

        return $offenders;
    }

    /**
     * The `panelalpha/*` packages the Community package requires beyond the
     * controller and the Engine client, or a note that its `composer.json`
     * cannot be read.
     *
     * @return list<string>
     */
    private function communityOffenders(string $packagesRoot): array
    {
        $file = $packagesRoot.'/community/composer.json';
        $decoded = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        if (! is_array($decoded)) {
            return ['composer.json is not readable'];
        }

        // `require-dev` counts too: a dev-only legacy dependency still lets tests hide a broken boundary.
        $decoded['require'] = array_merge($decoded['require'] ?? [], $decoded['require-dev'] ?? []);

        return array_values(array_diff(
            $this->panelalphaRequires($decoded),
            ['panelalpha/client-area', 'panelalpha/engine-client', 'panelalpha/hub'],
        ));
    }

    /**
     * The `panelalpha/*` packages the Engine client requires, or a note that its
     * `composer.json` cannot be read.
     *
     * @return list<string>
     */
    private function engineClientOffenders(string $packagesRoot): array
    {
        $file = $packagesRoot.'/engine-client/composer.json';
        $decoded = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        if (! is_array($decoded)) {
            return ['composer.json is not readable'];
        }

        return $this->panelalphaRequires($decoded);
    }

    /**
     * Every `panelalpha/*` requirement, so the direction cannot be smuggled in
     * through a differently-spelled key.
     *
     * @param  array<string, mixed>  $composer
     * @return list<string>
     */
    private function panelalphaRequires(array $composer): array
    {
        $names = array_values(array_filter(
            array_keys($composer['require'] ?? []),
            static fn (string $name): bool => str_starts_with($name, 'panelalpha/'),
        ));
        sort($names);

        return $names;
    }

    /**
     * @return list<string>
     */
    private function packageFiles(string $relative): array
    {
        $root = base_path($relative);
        $this->assertDirectoryExists($root);

        $files = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS),
        );
        foreach ($iterator as $file) {
            if ($file instanceof \SplFileInfo && $file->isFile()) {
                $files[] = $file->getPathname();
            }
        }
        sort($files);

        return $files;
    }

    /**
     * @return array<string, mixed>
     */
    private function composer(string $relative): array
    {
        $decoded = json_decode((string) file_get_contents(base_path($relative)), true, 512, JSON_THROW_ON_ERROR);
        $this->assertIsArray($decoded);

        return $decoded;
    }
}
