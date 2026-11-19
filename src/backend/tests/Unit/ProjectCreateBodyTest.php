<?php

namespace Tests\Unit;

use PanelAlpha\EngineClient\Support\ProjectCreateBody;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The flat project create rewritten as the typed body of Engine 2.3.0, and a
 * typed refusal's field named back.
 *
 * @see Engine core/app/Lib/Project/Create/CreateShape.php (GROUPS, LEGACY_FIELDS)
 * @see Engine core/app/Lib/Project/Create/CreateFields.php (typed field names)
 */
final class ProjectCreateBodyTest extends TestCase
{
    public function test_a_git_container_create_becomes_a_typed_git_source(): void
    {
        $this->assertSame([
            'name' => 'shop',
            'runtime' => 'container',
            'domain' => ['name' => 'shop.example.com'],
            'build' => ['env_vars' => ['APP_ENV' => 'production']],
            'source' => [
                'type' => 'git',
                'url' => 'https://github.com/acme/shop',
                'branch' => 'main',
                'auth' => ['type' => 'token', 'token' => 'ghp_x'],
            ],
        ], ProjectCreateBody::typed([
            'domain' => 'shop.example.com',
            'username' => 'shop',
            'git_repo' => 'https://github.com/acme/shop',
            'git_branch' => 'main',
            'git_token' => 'ghp_x',
            'template' => 'dind',
            'env_vars' => ['APP_ENV' => 'production'],
        ]));
    }

    /**
     * `{"name": "shop"}` alone is the flat body and makes a classic project
     * (as on an older Engine), so a classic create always says `php_hosting`.
     */
    public function test_a_classic_create_always_names_its_runtime(): void
    {
        $this->assertSame(['runtime' => 'php_hosting', 'domain' => ['name' => 'shop.example.com']], ProjectCreateBody::typed(['domain' => 'shop.example.com']));
        $this->assertSame(['name' => 'shop', 'runtime' => 'php_hosting'], ProjectCreateBody::typed(['name' => 'shop']));
        $this->assertSame(['runtime' => 'container'], ProjectCreateBody::typed(['template' => 'dind']));
    }

    /**
     * A repository makes a container project on the flat create too
     * (`NewProjectRules::createsContainer`).
     */
    public function test_a_git_repository_without_a_template_is_a_container(): void
    {
        $this->assertSame([
            'runtime' => 'container',
            'source' => ['type' => 'git', 'url' => 'https://github.com/acme/shop'],
        ], ProjectCreateBody::typed(['git_repo' => 'https://github.com/acme/shop']));
    }

    /**
     * The paid plan's limits (edition-pro `PlanLimits::KEYS`) go into
     * `limits`, `settings` and `network`; one left at the top level is a
     * `legacy_field` refusal (`CreateBody::legacyOrUnknown`).
     */
    public function test_plan_limits_go_into_their_groups(): void
    {
        $this->assertSame([
            'runtime' => 'php_hosting',
            'domain' => ['name' => 'shop.example.com'],
            'limits' => [
                'disk' => 1024,
                'memory' => 512,
                'cpu' => 1.5,
                'device_read_bps' => 100,
                'device_write_bps' => 200,
                'bandwidth' => -1,
                'mysql_databases' => 5,
                'ftp_accounts' => 2,
                'sftp_accounts' => 3,
                'addon_domains' => 4,
                'subdomains' => 6,
                'inodes' => 100000,
            ],
            'settings' => [
                'php_fpm_pool_settings' => 'pm.max_children = 5',
                'lsphp_settings' => 'PHP_LSAPI_CHILDREN=10',
                'redis_config' => 'maxmemory 64mb',
            ],
        ], ProjectCreateBody::typed([
            'domain' => 'shop.example.com',
            'disk_space_limit' => 1024,
            'memory_limit' => 512,
            'cpu_limit' => 1.5,
            'device_read_bps' => 100,
            'device_write_bps' => 200,
            'bandwidth_limit' => -1,
            'mysql_databases_limit' => 5,
            'ftp_accounts_limit' => 2,
            'sftp_accounts_limit' => 3,
            'addon_domains_limit' => 4,
            'subdomains_limit' => 6,
            'inodes_limit' => 100000,
            'php_fpm_pool_settings' => 'pm.max_children = 5',
            'lsphp_settings' => 'PHP_LSAPI_CHILDREN=10',
            'redis_config' => 'maxmemory 64mb',
        ]));
    }

    /**
     * A key the converter does not know is sent as it is, so the Engine names
     * it (`unknown_field`) instead of the panel dropping it silently.
     */
    public function test_an_unknown_key_is_sent_as_it_is(): void
    {
        $this->assertSame(['runtime' => 'php_hosting', 'surprise' => 1], ProjectCreateBody::typed(['surprise' => 1]));
    }

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function typedFields(): array
    {
        return [
            'domain' => ['domain.name', 'username', 'domain'],
            'name (username)' => ['name', 'username', 'username'],
            'name (name)' => ['name', 'name', 'name'],
            'name (clone)' => ['name', 'new_username', 'new_username'],
            'repository' => ['source.url', 'username', 'git_repo'],
            'branch' => ['source.branch', 'username', 'git_branch'],
            'token' => ['source.auth.token', 'username', 'git_token'],
            'deploy key' => ['source.auth.key', 'username', 'git_deploy_key'],
            'archive path' => ['source.path', 'username', 'zip_path'],
            'runtime' => ['runtime', 'username', 'template'],
            'memory' => ['limits.memory', 'username', 'memory_limit'],
            'redis' => ['settings.redis_config', 'username', 'redis_config'],
            'one env var' => ['build.env_vars.APP_KEY', 'username', 'env_vars.APP_KEY'],
            'one stage' => ['build.stages.build', 'username', 'stages.build'],
            'tunnel' => ['domain.tunnel', 'username', 'tunnel'],
            'unmapped' => ['source.upload_id', 'username', 'source.upload_id'],
        ];
    }

    #[DataProvider('typedFields')]
    public function test_a_typed_field_is_named_as_the_flat_body_named_it(string $typed, string $nameField, string $flat): void
    {
        $this->assertSame($flat, ProjectCreateBody::flatField($typed, $nameField));
    }

    public function test_the_name_field_is_the_one_the_flat_body_used(): void
    {
        $this->assertSame('username', ProjectCreateBody::nameField(['username' => 'shop']));
        $this->assertSame('username', ProjectCreateBody::nameField(['username' => 'shop', 'name' => 'Shop']));
        $this->assertSame('name', ProjectCreateBody::nameField(['name' => 'shop']));
        // The Engine answers a generated name's refusal under `username`.
        $this->assertSame('username', ProjectCreateBody::nameField([]));
    }
}
