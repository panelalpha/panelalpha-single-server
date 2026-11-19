<?php

namespace Tests\Feature\ClientArea\Labels;

use Illuminate\Support\Facades\Schema;

/**
 * The label schema as the driver reports it (columns, indexes,
 * foreign keys of `labels` and `application_labels`), in a stable order.
 * `EXPECTED` is the schema a migrate must produce.
 */
final class LabelSchema
{
    public const TABLES = ['labels', 'application_labels'];

    /**
     * Architecture §5 "Schema rules": the old panel's natural unique keys, the
     * `label_id` FK (`nullOnDelete`), `application_id` cascading, and
     * `labels.user_id` on the users table.
     */
    public const EXPECTED = [
        'labels' => [
            'columns' => [
                'color' => ['varchar', false, null],
                'created_at' => ['datetime', true, null],
                'id' => ['integer', false, null],
                'title' => ['varchar', false, null],
                'updated_at' => ['datetime', true, null],
                'user_id' => ['integer', true, null],
            ],
            'indexes' => [
                'labels_user_id_title_unique' => [['user_id', 'title'], true, false],
                'primary' => [['id'], true, true],
            ],
            'foreign_keys' => [
                'user_id → users(id) on delete cascade',
            ],
        ],
        'application_labels' => [
            'columns' => [
                'application_id' => ['integer', false, null],
                'color' => ['varchar', false, "''"],
                'created_at' => ['datetime', true, null],
                'id' => ['integer', false, null],
                'label_id' => ['integer', true, null],
                'title' => ['varchar', false, "''"],
                'updated_at' => ['datetime', true, null],
            ],
            'indexes' => [
                'application_labels_application_id_index' => [['application_id'], false, false],
                'application_labels_application_id_title_unique' => [['application_id', 'title'], true, false],
                'primary' => [['id'], true, true],
            ],
            'foreign_keys' => [
                'application_id → applications(id) on delete cascade',
                'label_id → labels(id) on delete set null',
            ],
        ],
    ];

    /**
     * @return array<string, array{columns: array<string, array{string, bool, mixed}>, indexes: array<string, array{list<string>, bool, bool}>, foreign_keys: list<string>}>
     */
    public static function snapshot(?string $connection = null): array
    {
        $schema = Schema::connection($connection);
        $snapshot = [];
        foreach (self::TABLES as $table) {
            $columns = [];
            foreach ($schema->getColumns($table) as $column) {
                $columns[(string) $column['name']] = [(string) $column['type_name'], (bool) $column['nullable'], $column['default']];
            }
            ksort($columns);

            $indexes = [];
            foreach ($schema->getIndexes($table) as $index) {
                $indexes[(string) $index['name']] = [array_values($index['columns']), (bool) $index['unique'], (bool) $index['primary']];
            }
            ksort($indexes);

            $foreignKeys = [];
            foreach ($schema->getForeignKeys($table) as $foreignKey) {
                $foreignKeys[] = implode(',', $foreignKey['columns']).' → '.$foreignKey['foreign_table']
                    .'('.implode(',', $foreignKey['foreign_columns']).') on delete '.strtolower((string) $foreignKey['on_delete']);
            }
            sort($foreignKeys);

            $snapshot[$table] = ['columns' => $columns, 'indexes' => $indexes, 'foreign_keys' => $foreignKeys];
        }

        return $snapshot;
    }
}
