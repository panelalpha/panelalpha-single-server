<?php

namespace Tests\Feature\Docs;

/**
 * The paid packages are submodules of their own repositories, which a Community
 * checkout leaves out: the guards that also cover them check only the ones
 * checked out (a package is checked out when its composer.json is there).
 */
trait PaidPackages
{
    /** @var list<string> */
    private static array $paidPackages = ['admin-area-controller', 'edition-multi', 'edition-pro'];

    private static function paidPackageCheckedOut(string $package): bool
    {
        return is_file(dirname(base_path()).'/packages/'.$package.'/composer.json');
    }

    /**
     * `$sites` (keyed by a path under src/, e.g. `packages/edition-pro/src/X.php`)
     * without the paths in a paid package that is not checked out.
     *
     * @template T
     *
     * @param  array<string, T>  $sites
     * @return array<string, T>
     */
    private static function withoutMissingPaidPackages(array $sites): array
    {
        return array_filter($sites, static function (string $path): bool {
            foreach (self::$paidPackages as $package) {
                if (str_starts_with($path, 'packages/'.$package.'/')) {
                    return self::paidPackageCheckedOut($package);
                }
            }

            return true;
        }, ARRAY_FILTER_USE_KEY);
    }

    private function skipWithoutPaidPackage(string $package): void
    {
        if (! self::paidPackageCheckedOut($package)) {
            $this->markTestSkipped("{$package} is not checked out (a paid package's repository).");
        }
    }
}
