<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Support\Facades\Schema;

/**
 * The `applications` schema as the driver reports it (columns,
 * indexes, foreign keys), in a stable order. `EXPECTED` is the schema a migrate
 * must produce.
 */
final class ApplicationsSchema
{
    public const TABLE = 'applications';

    /**
     * No `engine_usage`: the panel keeps no usage cache.
     */
    public const EXPECTED = [
        'columns' => [
            'auto_backup_attempted_at' => ['datetime', true, null],
            'auto_backup_state' => ['varchar', true, null],
            'created_at' => ['datetime', true, null],
            // The DNS badge's dismiss flag (2026-10-15).
            'dns_alerts_enabled' => ['tinyint', false, "'1'"],
            'domain' => ['varchar', true, null],
            'engine_created_at' => ['datetime', true, null],
            'engine_id' => ['integer', false, null],
            'engine_payload' => ['text', true, null],
            'engine_project_id' => ['integer', true, null],
            'engine_username' => ['varchar', false, null],
            'git_delivery_imported_at' => ['datetime', true, null],
            'git_delivery_imported_keys' => ['text', true, null],
            // The hook-deploy follower marker, a controller column.
            'git_hook_deploy_id' => ['varchar', true, null],
            'git_last_commit_at' => ['datetime', true, null],
            'git_last_commit_hash' => ['varchar', true, null],
            'git_last_commit_message' => ['varchar', true, null],
            'git_provider' => ['varchar', true, null],
            'git_source' => ['varchar', true, null],
            'git_token' => ['text', true, null],
            'git_webhook_id' => ['varchar', true, null],
            'id' => ['integer', false, null],
            'name' => ['varchar', true, null],
            // The classic-onboarding markers, controller columns.
            'onboarding_at' => ['datetime', true, null],
            'onboarding_files_at' => ['datetime', true, null],
            // When the panel asked the Engine for this project; null for a
            // mirrored one.
            'panel_created_at' => ['datetime', true, null],
            'replacing_at' => ['datetime', true, null],
            'screenshot_time' => ['integer', false, "'0'"],
            'site_name' => ['varchar', true, null],
            'staging_create_failed_at' => ['datetime', true, null],
            'staging_creating_at' => ['datetime', true, null],
            'staging_of_id' => ['integer', true, null],
            'status' => ['varchar', false, "'active'"],
            'synced_at' => ['datetime', true, null],
            'type' => ['varchar', true, null],
            'updated_at' => ['datetime', true, null],
        ],
        'indexes' => [
            'applications_engine_id_engine_username_unique' => [['engine_id', 'engine_username'], true, false],
            'applications_engine_id_index' => [['engine_id'], false, false],
            'primary' => [['id'], true, true],
        ],
        'foreign_keys' => [
            'staging_of_id → applications(id) on delete set null',
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
            $indexColumns = array_values($index['columns']);
            $indexes[(string) $index['name']] = [$indexColumns, (bool) $index['unique'], (bool) $index['primary']];
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
