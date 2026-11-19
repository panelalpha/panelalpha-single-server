<?php

namespace Tests\Browser\Support;

use RuntimeException;

/**
 * The Client Area user the Dusk suite signs in as, read from DUSK_USER_FILE
 * (`email=`, `password=`, optional `url=`) – the file the lead provides; the
 * password is never logged or embedded in an exception.
 */
final readonly class DuskUser
{
    public function __construct(
        public string $email,
        public string $password,
    ) {}

    /**
     * Parse the test-user file. Accepted lines are `key=value`; blank lines and
     * `#` comments are ignored.
     */
    public static function fromFile(string $path): self
    {
        if (! is_file($path) || ! is_readable($path)) {
            throw new RuntimeException("The Dusk user file is not readable: {$path}.");
        }

        $values = [];
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $parts = explode('=', $line, 2);
            if (count($parts) !== 2) {
                continue;
            }
            $values[trim($parts[0])] = trim($parts[1]);
        }

        foreach (['email', 'password'] as $key) {
            if (! isset($values[$key]) || $values[$key] === '') {
                throw new RuntimeException(
                    "The Dusk user file {$path} must define a non-empty '{$key}' line."
                );
            }
        }

        return new self($values['email'], $values['password']);
    }

    /**
     * Never render the password, not even in a test failure message.
     */
    public function __toString(): string
    {
        return $this->email;
    }
}
