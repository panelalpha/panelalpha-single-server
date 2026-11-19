<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The schema rules for `activity_logs`, owned by the controller: the acting user's FK points at the host's configurable
 * users table and survives the user (`nullOnDelete`), like the project FK
 * (`2026_10_10_000004_activity_logs_null_on_delete`).
 *
 * client-area-legacy's pushed `2026_10_10_000005_apply_schema_rules_to_panel_tables`
 * applies the same rule together with the label rules, and a pushed migration is
 * never edited. So the rule here is applied only when it is missing: where
 * legacy's 000005 already ran (every existing install, and a fresh install with
 * legacy, which runs it first) this is a no-op, and a fresh install without
 * legacy gets the same `activity_logs` schema. The label rules are the
 * controller's `2026_10_13_100000_apply_schema_rules_to_label_tables`.
 */
return new class extends Migration
{
    public function up(): void
    {
        $usersTable = (string) config('client-area.users_table', 'users');

        // The create migration's `constrained()->nullOnDelete()` points at
        // `users`; 000005 re-pointed it at the configured users table. With the
        // default table the create migration's key already is that rule.
        if (! $this->hasForeignKey('activity_logs', 'user_id', $usersTable, 'set null')) {
            Schema::table('activity_logs', function (Blueprint $table) use ($usersTable): void {
                $table->dropForeign(['user_id']);
                $table->foreign('user_id')->references('id')->on($usersTable)->nullOnDelete();
            });
        }
    }

    /**
     * Nothing to undo: where legacy's 000005 created the rule it never undid it,
     * and rolling back the create migration drops the table.
     */
    public function down(): void
    {
        // Intentionally empty.
    }

    private function hasForeignKey(string $table, string $column, string $foreignTable, string $onDelete): bool
    {
        foreach (Schema::getForeignKeys($table) as $foreignKey) {
            if ($foreignKey['columns'] === [$column]
                && $foreignKey['foreign_table'] === $foreignTable
                && $foreignKey['foreign_columns'] === ['id']
                && strtolower((string) $foreignKey['on_delete']) === $onDelete) {
                return true;
            }
        }

        return false;
    }
};
