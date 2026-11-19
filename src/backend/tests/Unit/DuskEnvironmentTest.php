<?php

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use RuntimeException;
use Tests\Browser\Support\DuskEnvironment;
use Tests\Browser\Support\DuskUser;
use Tests\TestCase;

/**
 * The Dusk suite only ever runs against a live panel the lead points it at, so
 * the one hermetic part is how it reads that configuration: the
 * base URL, the WebDriver endpoint and the user file must come from the
 * environment, and the user-file parser must never leak the password.
 */
final class DuskEnvironmentTest extends TestCase
{
    /** @var list<string> */
    private array $touched = [];

    private ?string $userFile = null;

    protected function tearDown(): void
    {
        foreach ($this->touched as $name) {
            putenv($name);
            unset($_ENV[$name], $_SERVER[$name]);
        }
        $this->touched = [];

        if ($this->userFile !== null && is_file($this->userFile)) {
            unlink($this->userFile);
        }
        $this->userFile = null;

        parent::tearDown();
    }

    #[Test]
    public function test_it_reads_the_base_url_from_the_environment(): void
    {
        $this->setEnv(DuskEnvironment::BASE_URL, 'http://localhost:9180');

        $this->assertSame('http://localhost:9180', DuskEnvironment::baseUrl());
    }

    #[Test]
    public function test_it_reads_the_driver_url_from_the_environment(): void
    {
        // A value no default (run-dusk.sh uses LOOPBACK:4444) provides, so a
        // hard-coded driver URL cannot satisfy this test.
        $this->setEnv(DuskEnvironment::DRIVER_URL, 'http://driver.example.test:5555');

        $this->assertSame('http://driver.example.test:5555', DuskEnvironment::driverUrl());
    }

    #[Test]
    public function test_it_reads_the_user_file_from_the_environment(): void
    {
        $this->setEnv(DuskEnvironment::USER_FILE, '/tmp/pa-dusk-user');

        $this->assertSame('/tmp/pa-dusk-user', DuskEnvironment::userFile());
    }

    #[Test]
    public function test_it_parses_the_user_file_without_exposing_the_password(): void
    {
        $this->writeUserFile("email=dusk@localhost.test\npassword=s3cret\nurl=http://localhost:9180\n");

        $user = DuskUser::fromFile($this->userFile ?? '');

        $this->assertSame('dusk@localhost.test', $user->email);
        $this->assertSame('s3cret', $user->password);
        $this->assertSame('dusk@localhost.test', (string) $user);
        $this->assertStringNotContainsString('s3cret', (string) $user);
    }

    #[Test]
    public function test_a_missing_variable_is_refused_by_name(): void
    {
        putenv(DuskEnvironment::BASE_URL);
        unset($_ENV[DuskEnvironment::BASE_URL], $_SERVER[DuskEnvironment::BASE_URL]);

        try {
            DuskEnvironment::baseUrl();
            $this->fail('A missing DUSK_BASE_URL must not be read.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString(DuskEnvironment::BASE_URL, $e->getMessage());
        }
    }

    #[Test]
    public function test_a_user_file_without_a_password_is_refused(): void
    {
        $this->writeUserFile("email=dusk@localhost.test\n");

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('password');

        DuskUser::fromFile($this->userFile ?? '');
    }

    private function setEnv(string $name, string $value): void
    {
        putenv("{$name}={$value}");
        $_ENV[$name] = $value;
        $this->touched[] = $name;
    }

    private function writeUserFile(string $contents): void
    {
        $path = tempnam(sys_get_temp_dir(), 'pa-dusk-user-');
        $this->assertIsString($path);
        file_put_contents($path, $contents);
        $this->userFile = $path;
    }
}
