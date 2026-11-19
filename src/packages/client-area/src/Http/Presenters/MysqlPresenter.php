<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

/**
 * Shapes Engine MySQL payloads the way the Client Area reads them (migration
 * section L, old User\ServerAccount\Mysql resources).
 *
 * The Engine names the size `size_bytes`; the CA reads `disk_usage`.
 */
final class MysqlPresenter
{
    /**
     * @param  array<string, mixed>  $database  Engine MysqlDatabaseResource
     * @return array<string, mixed>
     */
    public function database(array $database): array
    {
        return [
            'database' => $database['database'] ?? '',
            'disk_usage' => $database['size_bytes'] ?? null,
            'created_at' => $database['created_at'] ?? null,
            'updated_at' => $database['updated_at'] ?? null,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $databases
     * @return list<array<string, mixed>>
     */
    public function databases(array $databases): array
    {
        return array_map(fn (array $db) => $this->database($db), $databases);
    }

    /**
     * @param  array<string, mixed>  $user  Engine MysqlUserResource
     * @return array<string, mixed>
     */
    public function user(array $user): array
    {
        /** @var mixed $rawDatabases */
        $rawDatabases = $user['databases'] ?? null;
        $databases = is_array($rawDatabases) ? $rawDatabases : [];

        return [
            'user' => $user['user'] ?? '',
            'databases' => array_values(array_filter($databases, 'is_string')),
            'created_at' => $user['created_at'] ?? null,
            'updated_at' => $user['updated_at'] ?? null,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $users
     * @return list<array<string, mixed>>
     */
    public function users(array $users): array
    {
        return array_map(fn (array $u) => $this->user($u), $users);
    }
}
