<?php

namespace Tests\Feature\Docs;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * The two Engine contract generators were first pinned to the deployed
 * ref `gitlab-develop-29ae50bc0` unioned with `origin/feat/wordpress`; the
 * deployed contract then moved to `origin/GITHUB/develop` (`daf4ad737`): the route
 * generator reads it, the paths generator unions it with the two older refs. The
 * generators are shell fragments that read a read-only Engine checkout, so this
 * test builds a throwaway git repo that carries every branch name and runs each
 * script against it, then asserts the
 * generated files.
 *
 * The paths generator's default parameter expansion once carried a stray `}`
 * that corrupted the branch name even when `ENGINE_BRANCHES` was set, so the
 * script failed before writing anything; running it proves the default works.
 *
 * @see src/backend/scripts/generate-engine-develop-routes.sh
 * @see src/backend/scripts/generate-engine-paths.sh
 */
final class EngineContractScriptsTest extends TestCase
{
    private string $root = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->root = sys_get_temp_dir().'/panelalpha-generators-'.bin2hex(random_bytes(6));
    }

    protected function tearDown(): void
    {
        if ($this->root !== '') {
            File::deleteDirectory($this->root);
        }

        parent::tearDown();
    }

    public function test_the_develop_route_generator_snapshots_from_the_pinned_default(): void
    {
        $this->harness();

        $this->runScript($this->root.'/harness/scripts/generate-engine-develop-routes.sh');

        $out = (string) file_get_contents($this->root.'/harness/tests/Feature/Docs/engine-develop-routes.txt');

        // The develop branch adds the PHP error-log route; only
        // a run against `origin/GITHUB/develop` carries it.
        $this->assertSame(implode("\n", [
            '/projects/{username}/domains',
            '/projects/{username}/php/error-log',
            '/projects/{username}/push',
            '/system/info',
            '/tasks/{id}/cancel',
            '',
        ]), $out);
    }

    public function test_the_paths_generator_unions_the_pinned_default_with_wordpress(): void
    {
        $this->harness();

        $this->runScript($this->root.'/harness/scripts/generate-engine-paths.sh');

        $out = (string) file_get_contents($this->root.'/harness/tests/Feature/Docs/engine-paths.txt');

        $this->assertStringContainsString("core/app/Foo.php\t1", $out);
        // The WordPress branch adds a two-line file; the union keeps it.
        $this->assertStringContainsString("core/app/WordPress.php\t2", $out);
        // The develop branch adds a three-line file; the union keeps it.
        $this->assertStringContainsString("core/app/Develop.php\t3", $out);
        $this->assertStringContainsString("core/config/bar.php\t1", $out);
        $this->assertStringContainsString("core/database/baz.php\t1", $out);
    }

    public function test_the_generator_defaults_name_the_pinned_contract_ref(): void
    {
        foreach (['generate-engine-develop-routes.sh', 'generate-engine-paths.sh'] as $script) {
            $contents = (string) file_get_contents(base_path('scripts/'.$script));
            $this->assertStringNotContainsString('github-develop-6c83024', $contents);
        }

        // The deployed contract is `origin/GITHUB/develop`; the paths
        // union keeps the former pin and the WordPress branch.
        $this->assertStringContainsString(
            'engine_branch="${ENGINE_BRANCH:-origin/GITHUB/develop}"',
            (string) file_get_contents(base_path('scripts/generate-engine-develop-routes.sh')),
        );
        $this->assertStringContainsString(
            'branches="${ENGINE_BRANCHES:-${ENGINE_BRANCH:-gitlab-develop-29ae50bc0 origin/GITHUB/develop origin/feat/wordpress}}"',
            (string) file_get_contents(base_path('scripts/generate-engine-paths.sh')),
        );
    }

    /**
     * Build the throwaway Engine checkout and copy the scripts into a harness
     * root so their relative `tests/Feature/Docs/…` output lands in it.
     */
    private function harness(): void
    {
        File::makeDirectory($this->root.'/harness/scripts', 0777, true);
        File::makeDirectory($this->root.'/harness/tests/Feature/Docs', 0777, true);
        File::copy(base_path('scripts/generate-engine-develop-routes.sh'), $this->root.'/harness/scripts/generate-engine-develop-routes.sh');
        File::copy(base_path('scripts/generate-engine-paths.sh'), $this->root.'/harness/scripts/generate-engine-paths.sh');

        foreach (['core/routes', 'core/app', 'core/config', 'core/database'] as $dir) {
            File::makeDirectory($this->root.'/engine/'.$dir, 0777, true);
        }

        File::put($this->root.'/engine/core/routes/api.php', <<<'PHP'
        <?php
        $projectRoutes = function () {
            Route::get('/{username}/domains', [DomainController::class, 'index']);
            Route::put('/{username}/push', [StagingController::class, 'push']);
        };
        Route::get('/system/info', [SystemController::class, 'info']);
        Route::post('/tasks/{id}/cancel', [TaskController::class, 'cancel']);
        PHP);
        File::put($this->root.'/engine/core/app/Foo.php', "<?php\n");
        File::put($this->root.'/engine/core/config/bar.php', "<?php\n");
        File::put($this->root.'/engine/core/database/baz.php', "<?php\n");

        $this->git(['init', '-q']);
        $this->git(['config', 'user.email', 'agent@example.com']);
        $this->git(['config', 'user.name', 'Agent']);
        $this->git(['add', '-A']);
        $this->git(['commit', '-qm', 'contract fixture']);
        $this->git(['branch', 'gitlab-develop-29ae50bc0']);
        $this->git(['branch', 'origin/feat/wordpress']);

        $this->git(['checkout', '-q', 'origin/feat/wordpress']);
        File::put($this->root.'/engine/core/app/WordPress.php', "<?php\n// wp\n");
        $this->git(['add', '-A']);
        $this->git(['commit', '-qm', 'wordpress']);

        // The deployed develop ref adds a route and a file.
        $this->git(['checkout', '-q', 'gitlab-develop-29ae50bc0']);
        $this->git(['checkout', '-q', '-b', 'origin/GITHUB/develop']);
        File::put($this->root.'/engine/core/routes/api.php', <<<'PHP'
        <?php
        $projectRoutes = function () {
            Route::get('/{username}/domains', [DomainController::class, 'index']);
            Route::get('/{username}/php/error-log', [PhpController::class, 'errorLog']);
            Route::put('/{username}/push', [StagingController::class, 'push']);
        };
        Route::get('/system/info', [SystemController::class, 'info']);
        Route::post('/tasks/{id}/cancel', [TaskController::class, 'cancel']);
        PHP);
        File::put($this->root.'/engine/core/app/Develop.php', "<?php\n// develop\n// daf4ad737\n");
        $this->git(['add', '-A']);
        $this->git(['commit', '-qm', 'develop']);
        $this->git(['checkout', '-q', 'gitlab-develop-29ae50bc0']);
    }

    /**
     * The generator defaults must name the pinned deploy ref; a fake branch
     * with exactly that name makes a wrong default fail the run above.
     *
     * @param  list<string>  $args
     */
    private function git(array $args): void
    {
        [$code, $stdout, $stderr] = $this->process(array_merge(['git'], $args));
        $this->assertSame(0, $code, implode(' ', $args)."\n".$stdout.$stderr);
    }

    private function runScript(string $script): void
    {
        [$code, $stdout, $stderr] = $this->process(['/bin/bash', $script], dirname($script));
        $this->assertSame(0, $code, $stdout.$stderr);
    }

    /**
     * @param  list<string>  $command
     * @return array{int, string, string}
     */
    private function process(array $command, ?string $cwd = null): array
    {
        $inherited = getenv();
        $env = array_merge(is_array($inherited) ? $inherited : [], ['ENGINE_REPO' => $this->root.'/engine']);

        $pipes = [];
        $process = proc_open(
            $command,
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            $cwd ?? $this->root.'/engine',
            $env,
        );
        $this->assertIsResource($process);

        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return [proc_close($process), $stdout, $stderr];
    }
}
