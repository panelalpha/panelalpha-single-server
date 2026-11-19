<?php

namespace Tests\Feature\Docs;

use PHPUnit\Framework\Attributes\Test;
use Symfony\Component\Process\Process;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * `run-dusk.sh` is the only supported way to start the Chrome container and the
 * ported Dusk suite. The host needs only Docker: Chrome runs in selenium/standalone-chrome and the suite itself
 * runs in the composer:2 image the hermetic gate already uses. The test
 * executes the real script with a stubbed `docker` binary, so it never touches
 * a browser or a container.
 */
final class RunDuskScriptTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();

        $this->dir = sys_get_temp_dir().'/run-dusk-script-'.bin2hex(random_bytes(6));
        mkdir($this->dir, 0777, true);

        $this->writeStub('docker', $this->loggingDocker("exit 0\n"));
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir.'/*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($this->dir);

        parent::tearDown();
    }

    #[Test]
    public function test_it_runs_php_in_docker_starts_chrome_and_stops_chrome(): void
    {
        $dockerLog = $this->dir.'/docker.log';
        $userFile = $this->dir.'/test-user';
        file_put_contents($userFile, "email=dusk@localhost.test\npassword=secret\n");

        $process = new Process(
            ['bash', base_path('scripts/run-dusk.sh'), '--filter=LoginTest'],
            base_path(),
            [
                'PATH' => $this->dir.':'.(string) getenv('PATH'),
                'DOCKER' => $this->dir.'/docker',
                'DOCKER_LOG' => $dockerLog,
                'DUSK_DRIVER_WAIT_SECONDS' => '0',
                'DUSK_BASE_URL' => 'http://localhost:9180',
                'DUSK_USER_FILE' => $userFile,
            ],
        );
        $process->run();

        $this->assertSame(0, $process->getExitCode(), $process->getErrorOutput());

        $docker = $this->readLog($dockerLog);
        $this->assertStringContainsString('run -d --rm --name panelalpha-dusk-chrome --network host', $docker);
        $this->assertStringContainsString('rm -f panelalpha-dusk-chrome', $docker);

        // The suite itself runs in the composer:2 image, not on the host.
        $this->assertStringContainsString('composer:2 php artisan dusk --filter=LoginTest', $docker);
        $this->assertStringContainsString('--rm --network host', $docker);
        $this->assertStringContainsString('-v '.base_path().':/app', $docker);
        $this->assertStringContainsString('-e DUSK_DRIVER_URL=http://'.TestNetwork::LOOPBACK.':4444', $docker);
        $this->assertStringContainsString('-e DUSK_BASE_URL=http://localhost:9180', $docker);
        $this->assertStringContainsString('-e DUSK_USER_FILE='.$userFile, $docker);
        $this->assertStringContainsString("-v {$userFile}:{$userFile}:ro", $docker);
    }

    #[Test]
    public function test_it_stops_chrome_when_the_suite_fails(): void
    {
        $dockerLog = $this->dir.'/docker.log';

        // A failing suite (the PHP container exits non-zero) still must leave no
        // Chrome container behind.
        $this->writeStub('docker', $this->loggingDocker("if [[ \"\$*\" == *'artisan dusk'* ]]; then exit 7; fi\n"));

        $process = new Process(
            ['bash', base_path('scripts/run-dusk.sh')],
            base_path(),
            [
                'PATH' => $this->dir.':'.(string) getenv('PATH'),
                'DOCKER' => $this->dir.'/docker',
                'DOCKER_LOG' => $dockerLog,
                'DUSK_DRIVER_WAIT_SECONDS' => '0',
                'DUSK_BASE_URL' => 'http://localhost:9180',
                'DUSK_USER_FILE' => $this->dir.'/test-user',
            ],
        );
        $process->run();

        $this->assertSame(7, $process->getExitCode());
        $this->assertStringContainsString('rm -f panelalpha-dusk-chrome', $this->readLog($dockerLog));
    }

    /**
     * A `docker` stub that logs every invocation and then runs the extra body,
     * so one stub can both record the Chrome and the PHP runs and decide which
     * one fails.
     */
    private function loggingDocker(string $body): string
    {
        return "printf '%s\\n' \"\$*\" >> \"\${DOCKER_LOG}\"\n{$body}";
    }

    private function writeStub(string $name, string $body): string
    {
        $path = $this->dir.'/'.$name;
        file_put_contents($path, "#!/usr/bin/env bash\n{$body}");
        chmod($path, 0755);

        return $path;
    }

    private function readLog(string $path): string
    {
        return is_file($path) ? (string) file_get_contents($path) : '';
    }
}
