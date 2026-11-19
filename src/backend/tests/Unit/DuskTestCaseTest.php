<?php

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use Tests\Browser\Support\DuskEnvironment;
use Tests\Browser\Support\DuskUser;
use Tests\DuskTestCase;
use Tests\TestCase;

/**
 * The Dusk base class must take the panel URL and the test user from the
 * environment, never from a hard-coded value, so the same
 * suite can point at any panel the lead provides.
 */
final class DuskTestCaseTest extends TestCase
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
    public function test_it_uses_the_environment_base_url(): void
    {
        $this->setEnv(DuskEnvironment::BASE_URL, 'http://localhost:9180');

        $this->assertSame('http://localhost:9180', (new DuskTestCaseProbe('probe'))->exposedBaseUrl());
    }

    #[Test]
    public function test_it_uses_the_environment_test_user(): void
    {
        $this->writeUserFile("email=dusk@localhost.test\npassword=secret\n");
        $this->setEnv(DuskEnvironment::USER_FILE, $this->userFile ?? '');

        $user = (new DuskTestCaseProbe('probe'))->exposedTestUser();

        $this->assertInstanceOf(DuskUser::class, $user);
        $this->assertSame('dusk@localhost.test', $user->email);
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

/**
 * @internal test probe that exposes the protected Dusk accessors
 */
final class DuskTestCaseProbe extends DuskTestCase
{
    public function exposedBaseUrl(): string
    {
        return $this->baseUrl();
    }

    public function exposedTestUser(): DuskUser
    {
        return $this->testUser();
    }
}
