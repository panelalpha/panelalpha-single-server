<?php

namespace Tests\Feature\ClientArea\Activity;

use Illuminate\Support\Facades\Schema;

/**
 * The `activity_logs` schema as the driver reports it (columns,
 * indexes, foreign keys), in a stable order. `EXPECTED` is the schema a
 * migrate must produce.
 */
final class ActivityLogSchema
{
    public const TABLE = 'activity_logs';

    /**
     * Architecture §5 "Schema rules": an audit table – both FKs `nullOnDelete`
     * so the history survives the project and the user, the user FK
     * on the users table – and no `tags` column.
     */
    public const EXPECTED = [
        'columns' => [
            'action' => ['varchar', false, null],
            // What an admin did as the user (no FK: the admins table is the paid Admin Area's).
            'admin_as_user' => ['tinyint', true, null],
            'admin_id' => ['integer', true, null],
            'application_id' => ['integer', true, null],
            'created_at' => ['datetime', true, null],
            'id' => ['integer', false, null],
            'ip_address' => ['varchar', true, null],
            'payload' => ['text', true, null],
            'request_method' => ['varchar', true, null],
            'request_uri' => ['varchar', true, null],
            'updated_at' => ['datetime', true, null],
            'user_id' => ['integer', true, null],
        ],
        'indexes' => [
            'activity_logs_action_index' => [['action'], false, false],
            'activity_logs_application_id_created_at_index' => [['application_id', 'created_at'], false, false],
            'primary' => [['id'], true, true],
        ],
        'foreign_keys' => [
            'application_id → applications(id) on delete set null',
            'user_id → users(id) on delete set null',
        ],
    ];

    /**
     * @return array{columns: array<string, array{string, bool, mixed}>, indexes: array<string, array{list<string>, bool, bool}>, foreign_keys: list<string>}
     */
    public static function snapshot(?string $connection = null): array
    {
        $schema = Schema::connection($connection);

        $columns = [];
        foreach ($schema->getColumns(self::TABLE) as $column) {
            $columns[(string) $column['name']] = [(string) $column['type_name'], (bool) $column['nullable'], $column['default']];
        }
        ksort($columns);

        $indexes = [];
        foreach ($schema->getIndexes(self::TABLE) as $index) {
            $indexes[(string) $index['name']] = [array_values($index['columns']), (bool) $index['unique'], (bool) $index['primary']];
        }
        ksort($indexes);

        $foreignKeys = [];
        foreach ($schema->getForeignKeys(self::TABLE) as $foreignKey) {
            $foreignKeys[] = implode(',', $foreignKey['columns']).' → '.$foreignKey['foreign_table']
                .'('.implode(',', $foreignKey['foreign_columns']).') on delete '.strtolower((string) $foreignKey['on_delete']);
        }
        sort($foreignKeys);

        return ['columns' => $columns, 'indexes' => $indexes, 'foreign_keys' => $foreignKeys];
    }
}
