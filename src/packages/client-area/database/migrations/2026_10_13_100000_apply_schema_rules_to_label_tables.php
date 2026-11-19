<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The schema rules for the label tables, owned by the controller: the natural unique keys the old panel enforced
 * (`labels(user_id, title)`, `application_labels(application_id, title)`), the
 * `label_id` FK, and the `labels.user_id` FK on the host's configurable users
 * table.
 *
 * client-area-legacy's pushed `2026_10_10_000005_apply_schema_rules_to_panel_tables`
 * applies the same label rules together with an `activity_logs` rule, and a
 * pushed migration is never edited. So each rule here is applied only when it
 * is missing: where legacy's 000005 already ran (every existing install, and a
 * fresh install with legacy, which runs it first) this is a no-op, and a fresh
 * install without legacy gets the complete label schema. Each schema change is
 * its own statement so the SQLite grammar never has to mix an index and a table
 * rebuild, as in 000005.
 */
return new class extends Migration
{
    public function up(): void
    {
        $usersTable = (string) config('client-area.users_table', 'users');

        if (! Schema::hasIndex('labels', ['user_id', 'title'], 'unique')) {
            Schema::table('labels', function (Blueprint $table): void {
                $table->unique(['user_id', 'title']);
            });
        }

        // The create migration's `constrained()` points at `users`; 000005
        // re-pointed it at the configured users table. With the default table
        // the create migration's key already is that rule.
        if (! $this->hasForeignKey('labels', 'user_id', $usersTable, 'cascade')) {
            Schema::table('labels', function (Blueprint $table) use ($usersTable): void {
                $table->dropForeign(['user_id']);
                $table->foreign('user_id')->references('id')->on($usersTable)->cascadeOnDelete();
            });
        }

        if (! Schema::hasIndex('application_labels', ['application_id', 'title'], 'unique')) {
            Schema::table('application_labels', function (Blueprint $table): void {
                $table->unique(['application_id', 'title']);
            });
        }

        // `label_id` keeps the denormalised title/color when the label goes.
        if (! $this->hasForeignKey('application_labels', 'label_id', 'labels', 'set null')) {
            Schema::table('application_labels', function (Blueprint $table): void {
                $table->foreign('label_id')->references('id')->on('labels')->nullOnDelete();
            });
        }
    }

    /**
     * Nothing to undo: where legacy's 000005 created these rules its own
     * `down()` owns them, and rolling back the create migration drops both
     * tables.
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
