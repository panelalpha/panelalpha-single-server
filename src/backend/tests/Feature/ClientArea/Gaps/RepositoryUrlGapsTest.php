<?php

namespace Tests\Feature\ClientArea\Gaps;

use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Git\RepositoryUrl;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The repository URLs the panel refuses before any Engine call.
 */
class RepositoryUrlGapsTest extends TestCase
{
    /**
     * @return array<string, array{string}>
     */
    public static function refusedUrlProvider(): array
    {
        return [
            'empty' => [''],
            'a space inside' => ['https://github.com/acme/my site'],
            'a backslash' => ['https:\\\\github.com\\acme\\site'],
            'scp style, host with an underscore' => ['git@git_server.example:acme/site.git'],
            'scp style, a user with a bad character' => ['g!t@github.com:acme/site.git'],
            'a scheme the panel does not clone over' => ['ftp://github.com/acme/site.git'],
            'a file scheme' => ['file:///srv/site.git'],
            'no host' => ['https:///acme/site.git'],
            'a host with a bad character' => ['https://git_server.example/acme/site.git'],
            'no path' => ['https://github.com'],
            'an ssh user with a bad character' => ['ssh://g!t@github.com/acme/site.git'],
        ];
    }

    #[DataProvider('refusedUrlProvider')]
    public function test_parse_refuses_the_url(string $url): void
    {
        $this->assertNull(RepositoryUrl::parse($url));
    }

    public function test_assert_valid_names_the_repo_url_field(): void
    {
        try {
            RepositoryUrl::assertValid('ftp://github.com/acme/site.git');
            $this->fail('A refused URL must raise a validation error.');
        } catch (ValidationException $e) {
            $this->assertSame(['Invalid repository URL.'], $e->errors()['repo_url']);
        }
    }

    public function test_assert_valid_accepts_a_https_url(): void
    {
        RepositoryUrl::assertValid('https://github.com/acme/site.git');

        $this->addToAssertionCount(1);
    }

    public function test_provider_of_a_value_that_is_not_a_url_is_null(): void
    {
        $this->assertNull(RepositoryUrl::provider('http:///'));
    }

    public function test_pin_host_of_an_ssh_url_without_a_host_is_null(): void
    {
        $this->assertNull(RepositoryUrl::pinHost('ssh:///acme/site.git'));
    }
}
