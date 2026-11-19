<?php

namespace Tests\Unit\Packages\Community;

use PanelAlpha\Community\Hub\Sleeper;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The two seams of the Hub install code command that read the world: stdin and
 * the clock.
 */
final class InstallCodeInputAndSleeperTest extends TestCase
{
    /**
     * Runs `InstallCodeInput::read()` in a child PHP whose stdin is the given text.
     *
     * @return array{code: string, password: string}
     */
    private function read(string $stdin): array
    {
        $backend = dirname(__DIR__, 4);
        $script = 'require '.var_export($backend.'/vendor/autoload.php', true).';'
            .'echo json_encode((new PanelAlpha\Community\Hub\InstallCodeInput)->read());';

        $process = proc_open([PHP_BINARY, '-r', $script], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $this->assertIsResource($process);
        fwrite($pipes[0], $stdin);
        fclose($pipes[0]);
        $out = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($process);

        $decoded = json_decode($out, true);
        $this->assertIsArray($decoded, "the child printed: {$out}");

        return ['code' => (string) $decoded['code'], 'password' => (string) $decoded['password']];
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: string}>
     */
    public static function inputs(): array
    {
        return [
            'code and password' => ["WDJB-MJHT\nS3cret-Pass\n", 'WDJB-MJHT', 'S3cret-Pass'],
            'windows line ends' => ["WDJB-MJHT\r\nS3cret-Pass\r\n", 'WDJB-MJHT', 'S3cret-Pass'],
            'the code is trimmed' => ["  WDJB-MJHT \t\nx\n", 'WDJB-MJHT', 'x'],
            'the password keeps its spaces' => ["WDJB-MJHT\n  pass with spaces  \n", 'WDJB-MJHT', '  pass with spaces  '],
            'no password line' => ["WDJB-MJHT\n", 'WDJB-MJHT', ''],
            'no newline at all' => ['WDJB-MJHT', 'WDJB-MJHT', ''],
            'an empty first line' => ["\npass\n", '', 'pass'],
            'empty input' => ['', '', ''],
            'more lines are ignored' => ["CODE\npass\nextra\n", 'CODE', 'pass'],
        ];
    }

    #[DataProvider('inputs')]
    public function test_the_code_is_the_first_line_and_the_password_the_second(string $stdin, string $code, string $password): void
    {
        $this->assertSame(['code' => $code, 'password' => $password], $this->read($stdin));
    }

    public function test_only_the_first_4096_bytes_of_stdin_are_read(): void
    {
        $read = $this->read("WDJB-MJHT\n".str_repeat('p', 10000));

        $this->assertSame('WDJB-MJHT', $read['code']);
        $this->assertSame(4096 - strlen("WDJB-MJHT\n"), strlen($read['password']));
    }

    public function test_a_pause_of_nothing_or_less_returns_at_once(): void
    {
        $sleeper = new Sleeper;
        $start = microtime(true);

        $sleeper->sleep(0.0);
        $sleeper->sleep(-5.0);

        $this->assertLessThan(0.5, microtime(true) - $start);
    }

    public function test_a_pause_waits_about_as_long_as_asked(): void
    {
        $start = microtime(true);

        (new Sleeper)->sleep(0.02);

        $this->assertGreaterThanOrEqual(0.019, microtime(true) - $start);
    }
}
