<?php

namespace Tests\Feature\Docs;

use Tests\TestCase;

/**
 * A plan-dependent yes/no is answered by `PlanFeatures` and the table in
 * `PlanFeature::TABLE`, never by comparing the licence type where it is needed.
 * Only the licence plumbing and the per-tier project limits may name the
 * licence type; a new file that does fails until it asks `PlanFeatures` (or is
 * listed here with its reason).
 */
final class PlanFeatureCallSitesTest extends TestCase
{
    use PaidPackages;

    /**
     * Path (from `src/`) => reason.
     *
     * @var array<string, string>
     */
    private const array SITES = [
        'packages/client-area/src/Access/PlanFeature.php' => 'The table of what each plan offers.',
        'packages/edition-pro/src/Edition/LicensedPlanFeatures.php' => 'The paid plan is the licence type.',
        'packages/edition-pro/src/Edition/LicenceOverride.php' => "A source build's licence type.",
        'packages/edition-pro/src/EditionProServiceProvider.php' => "Binds a source build's licence type.",
        'packages/admin-area-controller/src/AdminAreaControllerServiceProvider.php' => 'Binds the licensedata licence type.',
        'packages/admin-area-controller/src/Licensing/LicensedataLicenceType.php' => "The licence server's answer.",
        'packages/admin-area-controller/src/Licensing/LicenceTier.php' => 'The tier constants.',
        'packages/admin-area-controller/src/Licensing/LicenceData.php' => 'Reports the tier to the Admin Area SPA.',
        'packages/admin-area-controller/src/Licensing/PlanTierRules.php' => 'The per-tier project limits (values, not features).',
    ];

    public function test_only_the_licence_plumbing_names_the_licence_type(): void
    {
        $root = dirname(base_path());
        $found = [];
        foreach ([...glob($root.'/packages/*/src') ?: [], base_path('app')] as $directory) {
            $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($directory, \FilesystemIterator::SKIP_DOTS));
            foreach ($files as $file) {
                if (! $file instanceof \SplFileInfo || $file->getExtension() !== 'php') {
                    continue;
                }
                $source = (string) file_get_contents($file->getPathname());
                if (str_contains($source, 'LicenceType::') || str_contains($source, 'LicenceTier::')) {
                    $found[] = substr($file->getPathname(), strlen($root) + 1);
                }
            }
        }
        sort($found);

        $expected = array_keys(self::withoutMissingPaidPackages(self::SITES));
        sort($expected);

        $this->assertSame($expected, $found, 'A file names the licence type: ask PlanFeatures::has() instead, or list it here with its reason.');
    }
}
