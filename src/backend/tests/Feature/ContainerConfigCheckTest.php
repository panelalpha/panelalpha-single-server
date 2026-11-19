<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The real-image container check exists, is executable, runs the
 * real checks, and the gate runs it for infra changes. The check
 * itself is executed by the gate against the real `panelalpha-v1-check` image
 * (`backend/scripts/check-container-config.sh`); this test only pins the wiring
 * so it cannot be dropped silently (a real run proves the behaviour).
 */
class ContainerConfigCheckTest extends TestCase
{
    public function test_the_container_config_check_is_executable_and_runs_the_real_checks(): void
    {
        $path = base_path('scripts/check-container-config.sh');
        $this->assertFileExists($path);
        $this->assertTrue(is_executable($path), 'check-container-config.sh must be executable.');

        $script = (string) file_get_contents($path);
        foreach (['php-fpm8.5 -tt', 'nginx -t', 'supervisorctl', 'queue:work', 'entrypoint.sh', 'php8.5-fpm-long.sock'] as $needle) {
            $this->assertStringContainsString($needle, $script);
        }
        // The client-IP probes use curl, so the header
        // names it as a requirement.
        $this->assertStringContainsString('needs Docker and curl', $script);
    }

    public function test_the_container_check_requires_curl(): void
    {
        // A missing curl must stop the check with a clear message
        // instead of failing halfway through the probes. Run the script with a
        // PATH that has a docker stub but no curl.
        $bin = sys_get_temp_dir().'/panelalpha-check-bin-'.bin2hex(random_bytes(6));
        mkdir($bin, 0777, true);
        symlink('/usr/bin/dirname', $bin.'/dirname');
        file_put_contents($bin.'/docker', "#!/bin/sh\nexit 0\n");
        chmod($bin.'/docker', 0755);

        $script = base_path('scripts/check-container-config.sh');
        $inherited = getenv();
        $pipes = [];
        $process = proc_open(
            ['/bin/bash', $script],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            null,
            array_merge(is_array($inherited) ? $inherited : [], ['PATH' => $bin]),
        );
        $this->assertIsResource($process);

        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        $this->assertSame(1, proc_close($process), $stdout.$stderr);
        $this->assertStringContainsString('curl is not available', $stderr.$stdout);
    }

    public function test_the_container_check_runs_without_ipv6(): void
    {
        // The check container starts with IPv6 disabled, so nginx
        // must come up on the IPv4 loopback bind alone (a `listen [::1]:82`
        // would fail `bind()` and the container would exit before any probe).
        $script = (string) file_get_contents(base_path('scripts/check-container-config.sh'));

        $this->assertMatchesRegularExpression(
            '/docker run -d --name "\$CONTAINER" \\\\\n\s+--sysctl net\.ipv6\.conf\.all\.disable_ipv6=1 \\\\/',
            $script,
            'The check container must be started with --sysctl net.ipv6.conf.all.disable_ipv6=1.',
        );
    }

    public function test_the_container_check_uses_a_unique_name_per_run(): void
    {
        // Parallel gates must not `docker rm -f` each other's container.
        $script = (string) file_get_contents(base_path('scripts/check-container-config.sh'));

        $this->assertStringContainsString('PANELALPHA_CHECK_CONTAINER:-panelalpha-v1-check-$$', $script);
    }

    public function test_the_container_check_settles_workers(): void
    {
        // The check waits for a settled worker uptime (>= 10 s) and a stable PID,
        // so its fragment is executed against real `supervisorctl status`
        // strings (and a stubbed docker) rather than grepped.
        $script = (string) file_get_contents(base_path('scripts/check-container-config.sh'));

        $functions = '';
        foreach (['clock_seconds', 'uptime_seconds', 'worker_pids', 'settled_workers'] as $name) {
            $start = strpos($script, $name.'() {');
            $this->assertNotFalse($start, "The check must define {$name}().");
            $end = strpos($script, "\n}\n", (int) $start);
            $this->assertNotFalse($end, "The check must close {$name}().");
            $functions .= substr($script, (int) $start, (int) $end - (int) $start + 2)."\n";
        }

        $fixture = <<<'BASH'
#!/usr/bin/env bash
@@FUNCTIONS@@
queue_programs="queue-worker queue-worker-long"
settled_seconds=@@SETTLE@@
cid="x"
sleep() { :; }

printf 'uptime:%s\n' "$(uptime_seconds '0:00:05')"
printf 'uptime:%s\n' "$(uptime_seconds '0:00:10')"
printf 'uptime:%s\n' "$(uptime_seconds '1:02:03')"
printf 'uptime:%s\n' "$(uptime_seconds '2 days, 3:04:05')"

worker_pids 'queue-worker RUNNING pid 44, uptime 0:00:09
queue-worker-long RUNNING pid 45, uptime 0:00:09' >/dev/null && echo young-accepted || echo young-rejected
worker_pids 'queue-worker RUNNING pid 44, uptime 0:00:10
queue-worker-long RUNNING pid 45, uptime 0:00:10' >/dev/null && echo settled-accepted || echo settled-rejected
worker_pids 'queue-worker STARTING pid 44, uptime 0:00:30
queue-worker-long RUNNING pid 45, uptime 0:00:30' >/dev/null && echo starting-accepted || echo starting-rejected

calls=0
docker() { calls=$((calls+1)); printf 'queue-worker RUNNING pid 44, uptime 0:00:10\nqueue-worker-long RUNNING pid 45, uptime 0:00:10\n'; }
settled_workers && echo stable-accepted || echo stable-rejected

counter="$(mktemp)"
echo 0 > "$counter"
docker() { n=$(( $(cat "$counter") + 1 )); echo "$n" > "$counter"; printf 'queue-worker RUNNING pid %s, uptime 0:00:10\nqueue-worker-long RUNNING pid 45, uptime 0:00:10\n' "$n"; }
settled_workers && echo restart-accepted || echo restart-rejected
rm -f "$counter"
BASH;
        $this->assertMatchesRegularExpression(
            '/settled_seconds="\$\{PANELALPHA_CHECK_SETTLE_SECONDS:-(\d+)\}?"/',
            $script,
            'The settle window must have a pinned default.',
        );
        preg_match('/settled_seconds="\$\{PANELALPHA_CHECK_SETTLE_SECONDS:-(\d+)\}?"/', $script, $settle);
        $this->assertSame('10', $settle[1] ?? null);
        $fixture = str_replace(['@@FUNCTIONS@@', '@@SETTLE@@'], [$functions, $settle[1] ?? '10'], $fixture);

        $file = tempnam(sys_get_temp_dir(), 'settle');
        $this->assertIsString($file);
        file_put_contents($file, $fixture);

        try {
            $output = trim((string) shell_exec('bash '.escapeshellarg($file)));
        } finally {
            @unlink($file);
        }

        $this->assertSame(
            "uptime:5\nuptime:10\nuptime:3723\nuptime:183845\nyoung-rejected\nsettled-accepted\nstarting-rejected\nstable-accepted\nrestart-rejected",
            $output,
        );
    }
}
