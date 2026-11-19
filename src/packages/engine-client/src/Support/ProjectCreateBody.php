<?php

namespace PanelAlpha\EngineClient\Support;

/**
 * The two spellings of a project create (Engine 2.3.0): the flat
 * `POST /projects` body every Engine takes, and the typed one an Engine that
 * lists `project_source` takes (Engine core/app/Lib/Project/Create/CreateShape.php).
 *
 * The panel builds the flat body; `typed()` rewrites it, and `flatField()`
 * names a typed refusal's field as the flat body spelled it, so a caller's
 * error handling stays the same on both. The Engine keeps a problem's `code`
 * across the two; only `field` (and the `errors` keys) move.
 */
final class ProjectCreateBody
{
    /** Flat field => [typed group, key] (Engine `CreateShape::GROUPS`). */
    private const GROUPED = [
        'domain' => ['domain', 'name'],
        'tunnel' => ['domain', 'tunnel'],
        'domain_redirect_url' => ['domain', 'redirect_url'],
        'disk_space_limit' => ['limits', 'disk'],
        'memory_limit' => ['limits', 'memory'],
        'cpu_limit' => ['limits', 'cpu'],
        'device_read_bps' => ['limits', 'device_read_bps'],
        'device_write_bps' => ['limits', 'device_write_bps'],
        'bandwidth_limit' => ['limits', 'bandwidth'],
        'mysql_databases_limit' => ['limits', 'mysql_databases'],
        'ftp_accounts_limit' => ['limits', 'ftp_accounts'],
        'sftp_accounts_limit' => ['limits', 'sftp_accounts'],
        'addon_domains_limit' => ['limits', 'addon_domains'],
        'subdomains_limit' => ['limits', 'subdomains'],
        'inodes_limit' => ['limits', 'inodes'],
        'php_fpm_pool_settings' => ['settings', 'php_fpm_pool_settings'],
        'lsphp_settings' => ['settings', 'lsphp_settings'],
        'redis_config' => ['settings', 'redis_config'],
        'dedicated_ipv4' => ['network', 'dedicated_ipv4'],
        'dedicated_ipv6' => ['network', 'dedicated_ipv6'],
        'env_vars' => ['build', 'env_vars'],
        'recipe' => ['build', 'recipe'],
        'stages' => ['build', 'stages'],
    ];

    /** Typed field => flat field, for what is not a group key (Engine `CreateShape::LEGACY_FIELDS`, `CreateFields`). */
    private const FLAT_FIELDS = [
        'runtime' => 'template',
        'site_password' => 'password',
        'source.url' => 'git_repo',
        'source.branch' => 'git_branch',
        'source.auth.token' => 'git_token',
        'source.auth.key' => 'git_deploy_key',
        'source.path' => 'zip_path',
    ];

    /**
     * The typed body of a flat create. `runtime` is always sent: a body
     * without a typed key is the flat one, and an empty typed body is a
     * container (Engine `CreateShape::isTyped`, `CreateBody::runtime`). A git
     * repository makes a container project, as on the flat create. A key this
     * class does not know is sent as it is, so the Engine names it
     * (`unknown_field`) rather than the panel dropping it.
     *
     * @param  array<string, mixed>  $flat
     * @return array<string, mixed>
     */
    public static function typed(array $flat): array
    {
        $hasGit = is_string($flat['git_repo'] ?? null) && $flat['git_repo'] !== '';
        $container = ($flat['template'] ?? null) === 'dind' || $hasGit;

        $typed = [];
        foreach (['username' => 'name', 'name' => 'name', 'email' => 'email', 'password' => 'site_password'] as $field => $key) {
            if (array_key_exists($field, $flat)) {
                // `username` wins over `name`, as on the flat create (`NewProjectRules`).
                $typed += [$key => $flat[$field]];
            }
        }
        $typed += ['runtime' => $container ? 'container' : 'php_hosting'];

        $groups = [];
        foreach (self::GROUPED as $field => [$group, $key]) {
            if (array_key_exists($field, $flat)) {
                $groups[$group] = ($groups[$group] ?? []) + [$key => $flat[$field]];
            }
        }
        $typed += $groups;

        if ($hasGit) {
            $source = ['type' => 'git', 'url' => $flat['git_repo']];
            $branch = Payload::nullableString($flat['git_branch'] ?? null);
            if ($branch !== null && $branch !== '') {
                $source['branch'] = $branch;
            }
            $token = Payload::nullableString($flat['git_token'] ?? null);
            if ($token !== null && $token !== '') {
                $source['auth'] = ['type' => 'token', 'token' => $token];
            }
            $typed['source'] = $source;
        }

        $known = array_flip(['username', 'name', 'template', 'email', 'password', 'git_repo', 'git_branch', 'git_token']);

        return $typed + array_diff_key($flat, $known, self::GROUPED);
    }

    /**
     * The flat spelling of a typed refusal's field (`domain.name` → `domain`,
     * `source.url` → `git_repo`, `build.env_vars.KEY` → `env_vars.KEY`…).
     * `name` goes back to the field the flat body named the project with
     * (`username` or `name`), as the flat create answers under it.
     *
     * @param  string  $nameField  the flat body's name field
     */
    public static function flatField(string $field, string $nameField = 'name'): string
    {
        if ($field === 'name') {
            return $nameField;
        }

        $mapped = self::FLAT_FIELDS[$field] ?? null;
        if ($mapped !== null) {
            return $mapped;
        }

        foreach (self::GROUPED as $flat => [$group, $key]) {
            $typed = $group.'.'.$key;
            if ($field === $typed) {
                return $flat;
            }
            if (str_starts_with($field, $typed.'.')) {
                return $flat.substr($field, strlen($typed));
            }
        }

        return $field;
    }

    /**
     * The flat field a flat body names the project with.
     *
     * @param  array<string, mixed>  $flat
     */
    public static function nameField(array $flat): string
    {
        return array_key_exists('username', $flat) || ! array_key_exists('name', $flat) ? 'username' : 'name';
    }
}
