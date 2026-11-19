<?php

namespace Tests\Feature\Docs;

use Tests\TestCase;

/**
 * Every `defaultEngineId()` call in the packages and
 * the host app is a decision – in Multi the default Engine is only the panel's
 * own Engine, so a site that should reach a project's, a service's or a
 * token's Engine must not ask for it. The list pins each file's calls with
 * the reason it stays; a new call (or a file that drops one) fails until the
 * list says why.
 */
final class DefaultEngineCallSitesTest extends TestCase
{
    use PaidPackages;

    /**
     * Path (from `src/`) => [calls, reason].
     *
     * @var array<string, array{0: int, 1: string}>
     */
    private const array SITES = [
        // admin-area-controller
        'packages/admin-area-controller/src/Backups/EngineBackupContainers.php' => [1, 'The connection test asks the default Engine first, then every other.'],
        'packages/admin-area-controller/src/Http/Controllers/Backups/BackupContainerController.php' => [1, "A container's home Engine container is on the default Engine; the others follow."],
        'packages/admin-area-controller/src/Tasks/EngineTasks.php' => [1, "A bare task id is the default Engine's (Pro's contract)."],
        'packages/admin-area-controller/src/Http/Presenters/TaskPresenter.php' => [1, 'The fallback for a task without its engine_id.'],
        'packages/admin-area-controller/src/Http/Controllers/Wizard/WizardStepsController.php' => [1, "The server step names the panel's own Engine."],
        'packages/admin-area-controller/src/Engines/SingleEngineRegistry.php' => [2, "Pro's registry: one Engine."],
        'packages/admin-area-controller/src/Console/TelemetryHourlyCommand.php' => [1, "Telemetry reports the panel's own Engine (still open)."],
        // client-area
        'packages/client-area/src/Mcp/McpTokenService.php' => [3, 'One Engine (Community, Pro) and the fallbacks of the token Engine and the adoption.'],
        'packages/client-area/src/Http/Controllers/Mcp/McpProxyController.php' => [1, "The engine-mcp-url override names the panel's own Engine's MCP server."],
        'packages/client-area/src/Hosting/ProxyRuleService.php' => [5, 'Left for later: the Engines of a service.'],
        'packages/client-area/src/Http/Controllers/Hosting/HostingInfoController.php' => [1, 'Left for later: the server metrics of the single-server hosting pages.'],
        'packages/client-area/src/Http/Controllers/Project/ImportController.php' => [1, "Left for later: the import's plugin package on the Engine that runs the import."],
        'packages/client-area/src/Projects/WordPressImportService.php' => [1, "Left for later: the import's connection test on the Engine that runs the import."],
        'packages/client-area/src/Projects/OnboardingService.php' => [1, 'Left for later: the git source probes, tied to no project.'],
        'packages/client-area/src/Support/SelfProject.php' => [1, "The panel's token is held by its own project, on the panel's own Engine."],
        // Moved from client-area-legacy.
        'packages/client-area/src/Hosting/DomainProbe.php' => [1, 'A probe without an owner, which no route reaches.'],
        // community: installed by the Community deployment only, one Engine
        'packages/community/src/Backups/BackupStoreManager.php' => [1, 'Community only: one Engine.'],
        'packages/community/src/Http/Controllers/SettingsController.php' => [1, 'Community only: one Engine (the sites base domain).'],
        'packages/community/src/Hub/CommunityHubPanel.php' => [1, 'Community only: one Engine.'],
        'packages/community/src/Jobs/ApplyNewProjectBackupSchedules.php' => [1, 'Community only: one Engine.'],
        'packages/community/src/Settings/PanelAddressMove.php' => [1, 'Community only: one Engine.'],
        'packages/community/src/Tasks/EngineTaskList.php' => [1, 'Community only: one Engine.'],
        // edition-multi
        'packages/edition-multi/src/Engines/MultiEngineRegistry.php' => [2, 'Placement with no matching server (still open).'],
    ];

    public function test_every_default_engine_call_is_decided(): void
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
                $calls = substr_count($source, 'defaultEngineId()') - substr_count($source, 'function defaultEngineId()');
                if ($calls > 0) {
                    $found[substr($file->getPathname(), strlen($root) + 1)] = $calls;
                }
            }
        }
        ksort($found);

        $expected = array_map(static fn (array $site): int => $site[0], self::withoutMissingPaidPackages(self::SITES));
        ksort($expected);

        $this->assertSame($expected, $found, 'A defaultEngineId() call was added or removed: decide whether Multi needs the right Engine there and record it here.');
    }
}
