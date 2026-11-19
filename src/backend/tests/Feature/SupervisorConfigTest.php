<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Console\Input\ArgvInput;
use Symfony\Component\Console\Input\InputDefinition;
use Tests\TestCase;

/**
 * Parse the supervisord ini
 * **per section**, bind every `artisan` command line against the real Artisan
 * command's input definition (so an unknown option or argument fails here, not
 * in the container where supervisord would mark the program FATAL), and assert
 * the worker table (queues, connections, timeouts, stopwaitsecs, `user=www-data`)
 * with the matching `retry_after`.
 *
 * The connection is the positional argument of `queue:work`; `--connection` is
 * not a Laravel option and made both workers exit at container start.
 *
 * @see Architecture §7.4 (queue/worker table, F5/T10)
 * @see src/config/supervisord.conf
 */
class SupervisorConfigTest extends TestCase
{
    /**
     * @return array<string, array<string, string>>
     */
    private static function parsedSections(): array
    {
        // Not base_path(): the data provider runs before the app is booted.
        $contents = (string) file_get_contents(base_path('../config/supervisord.conf'));

        $sections = [];
        $current = null;
        foreach (preg_split('/\r?\n/', $contents) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, ';')) {
                continue;
            }
            if (preg_match('/^\[(.+)\]$/', $line, $m) === 1) {
                $current = $m[1];
                $sections[$current] = [];
                continue;
            }
            if ($current !== null && str_contains($line, '=')) {
                [$key, $value] = explode('=', $line, 2);
                $sections[$current][trim($key)] = trim($value);
            }
        }

        return $sections;
    }

    /**
     * @return array<string, array<string, string>>
     */
    private function sections(): array
    {
        return self::parsedSections();
    }

    /**
     * Every supervisord program that runs an `artisan` command, one case each so
     * a binding failure is not hidden behind the first program.
     *
     * @return array<string, array{string}>
     */
    public static function artisanProgramProvider(): array
    {
        $programs = [];
        foreach (self::parsedSections() as $section => $values) {
            if (str_starts_with($section, 'program:') && str_contains($values['command'] ?? '', 'artisan')) {
                $programs[$section] = [$section];
            }
        }

        return $programs;
    }

    /**
     * Parse a supervisord `command` into the Artisan command name and its argv,
     * then bind the argv against the command's real input definition plus the
     * application definition (the same `ArgvInput` bind `Command::run()` does).
     * An unknown option/argument throws here.
     *
     * @return array{string, list<string>, ArgvInput}
     */
    private function artisanInvocation(string $section): array
    {
        $command = $this->sections()[$section]['command'];
        $tokens = preg_split('/\s+/', trim($command)) ?: [];

        $artisan = null;
        foreach ($tokens as $index => $token) {
            if (str_ends_with($token, 'artisan')) {
                $artisan = $index;
                break;
            }
        }
        $this->assertNotNull($artisan, "{$section} does not run artisan.");

        /** @var list<string> $argv */
        $argv = array_values(array_slice($tokens, $artisan + 1));
        $name = $argv[0] ?? '';
        $this->assertNotSame('', $name, "{$section} has an empty artisan command.");

        $commands = Artisan::all();
        $this->assertArrayHasKey($name, $commands, "Artisan has no {$name} command.");
        $command = $commands[$name];
        $command->mergeApplicationDefinition();
        $definition = $command->getDefinition();
        $this->assertInstanceOf(InputDefinition::class, $definition);

        // ArgvInput strips the first element (the script name), so prepend one.
        $input = new ArgvInput(['artisan', ...$argv]);
        $input->bind($definition);
        $input->validate();

        return [$name, $argv, $input];
    }

    #[DataProvider('artisanProgramProvider')]
    public function test_every_artisan_program_binds_against_the_real_command_definition(string $section): void
    {
        [$name, $argv, $input] = $this->artisanInvocation($section);

        $this->assertSame($argv[0], $name);
        $this->assertSame($name, $input->getArgument('command'));
    }

    public function test_the_fast_worker_uses_the_database_connection(): void
    {
        $worker = $this->sections()['program:queue-worker'];
        [$name, , $input] = $this->artisanInvocation('program:queue-worker');

        $this->assertSame('queue:work', $name);
        $this->assertSame('www-data', $worker['user']);
        $this->assertSame('database', $input->getArgument('connection'));
        $this->assertSame('engine-tasks,default,sync', $input->getOption('queue'));
        $this->assertSame(1, (int) $input->getOption('sleep'));
        $this->assertSame(1, (int) $input->getOption('tries'));
        $this->assertSame(120, (int) $input->getOption('timeout'));
        $this->assertSame(3600, (int) $input->getOption('max-time'));
        $this->assertSame('130', $worker['stopwaitsecs']);
    }

    public function test_the_long_worker_uses_the_long_connection(): void
    {
        $worker = $this->sections()['program:queue-worker-long'];
        [$name, , $input] = $this->artisanInvocation('program:queue-worker-long');

        $this->assertSame('queue:work', $name);
        $this->assertSame('www-data', $worker['user']);
        $this->assertSame('database-long', $input->getArgument('connection'));
        $this->assertSame('long', $input->getOption('queue'));
        $this->assertSame(1, (int) $input->getOption('sleep'));
        $this->assertSame(1, (int) $input->getOption('tries'));
        $this->assertSame(1800, (int) $input->getOption('timeout'));
        $this->assertSame(3600, (int) $input->getOption('max-time'));
        $this->assertSame('1810', $worker['stopwaitsecs']);
    }

    public function test_the_scheduler_and_reverb_run_without_interaction(): void
    {
        [$scheduler, , $schedulerInput] = $this->artisanInvocation('program:scheduler');
        [$reverb, , $reverbInput] = $this->artisanInvocation('program:reverb');

        $this->assertSame('schedule:work', $scheduler);
        $this->assertTrue($schedulerInput->getOption('no-interaction'));
        $this->assertSame('www-data', $this->sections()['program:scheduler']['user']);

        $this->assertSame('reverb:start', $reverb);
        $this->assertTrue($reverbInput->getOption('no-interaction'));
        $this->assertSame('www-data', $this->sections()['program:reverb']['user']);
    }

    public function test_retry_after_stays_above_each_worker_timeout(): void
    {
        $this->assertSame(150, config('queue.connections.database.retry_after'));
        $this->assertSame(1900, config('queue.connections.database-long.retry_after'));
    }

    public function test_sqlite_is_configured_for_concurrent_writers(): void
    {
        $this->assertSame(5000, config('database.connections.sqlite.busy_timeout'));
        $this->assertSame('WAL', config('database.connections.sqlite.journal_mode'));
        $this->assertSame('IMMEDIATE', config('database.connections.sqlite.transaction_mode'));
    }
}
