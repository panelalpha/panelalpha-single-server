<?php

namespace Tests\Feature\ClientArea\Git;

use PanelAlpha\ClientArea\Git\RepositoryUrl;
use Tests\TestCase;

/**
 * URLs to the Engine: the URL sent to the Engine is rebuilt
 * from its parsed parts. The ssh/scp login user (`git@`) stays – it is not a
 * credential – and https userinfo is dropped.
 *
 * @see Engine core/app/Lib/Deploy/Source/GitUrl.php:148 (keeps the ssh login user)
 */
class RepositoryUrlTest extends TestCase
{
    public function test_scp_urls_keep_the_login_user(): void
    {
        $this->assertSame(
            ['host' => 'github.com', 'canonical' => 'ssh://git@github.com/acme/site.git'],
            RepositoryUrl::parse('git@github.com:acme/site.git'),
        );
    }

    public function test_scp_urls_without_a_user_stay_ssh(): void
    {
        $this->assertSame(
            'ssh://github.com/acme/site.git',
            RepositoryUrl::parse('github.com:acme/site.git')['canonical'] ?? null,
        );
    }

    public function test_ssh_urls_keep_the_login_user_and_drop_a_password(): void
    {
        $this->assertSame(
            'ssh://git@github.com/acme/site.git',
            RepositoryUrl::parse('ssh://git:secret@github.com/acme/site.git')['canonical'] ?? null,
        );
    }

    public function test_https_urls_drop_the_userinfo_credentials(): void
    {
        $this->assertSame(
            'https://github.com/acme/site.git',
            RepositoryUrl::parse('https://user:secret@github.com/acme/site.git')['canonical'] ?? null,
        );
        $this->assertSame(
            'https://github.com/acme/site.git',
            RepositoryUrl::parse('https://user@github.com/acme/site.git')['canonical'] ?? null,
        );
    }

    public function test_invalid_urls_are_rejected(): void
    {
        $this->assertNull(RepositoryUrl::parse(''));
        $this->assertNull(RepositoryUrl::parse('https://github.com'));
        $this->assertNull(RepositoryUrl::parse("https://github.com/acme/\\site.git"));
    }

    public function test_is_ssh_tells_an_ssh_canonical_from_an_https_one(): void
    {
        $this->assertTrue(RepositoryUrl::isSsh('ssh://git@github.com/acme/site.git'));
        $this->assertFalse(RepositoryUrl::isSsh('https://github.com/acme/site.git'));
    }

    public function test_pin_host_is_null_for_the_forges_the_engine_pins_itself(): void
    {
        $this->assertNull(RepositoryUrl::pinHost('ssh://git@github.com/acme/site.git'));
        $this->assertNull(RepositoryUrl::pinHost('ssh://git@gitlab.com/acme/site.git'));
        $this->assertNull(RepositoryUrl::pinHost('ssh://git@bitbucket.org/acme/site.git'));
    }

    public function test_pin_host_is_the_host_or_host_and_port_of_a_self_hosted_forge(): void
    {
        $this->assertSame('git.example.org', RepositoryUrl::pinHost('ssh://git@git.example.org/acme/site.git'));
        $this->assertSame('git.example.org:2222', RepositoryUrl::pinHost('ssh://git@git.example.org:2222/acme/site.git'));
    }

    public function test_pin_host_is_null_for_a_non_ssh_url(): void
    {
        $this->assertNull(RepositoryUrl::pinHost('https://git.example.org/acme/site.git'));
    }
}
