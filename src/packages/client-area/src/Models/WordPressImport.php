<?php

namespace PanelAlpha\ClientArea\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use PanelAlpha\ClientArea\Events\WordPressImportChanged;

/**
 * The panel's record of one WordPress site import (Engine 2.2.0):
 * the Engine migration that fills the classic project, and its last status.
 *
 * `status` is the Engine's migration status (`pending`, `running`,
 * `completed`, `failed`, `cancelling`, `cancelled`) once the Engine accepted
 * the import, and the panel's own `starting` before it (waiting for the
 * project's create task) or `failed` when the start was refused (`error`).
 *
 * @property int $id
 * @property int $application_id
 * @property int|null $engine_migration_id
 * @property string $method wp_admin | manual_plugin
 * @property string $source_url
 * @property string $status
 * @property array<string, mixed>|null $source the start body until the Engine accepted it, encrypted
 * @property array<string, mixed>|null $engine_status the last `GET /wordpress/migrations/{id}` answer
 * @property string|null $error
 * @property-read Application|null $application
 */
class WordPressImport extends Model
{
    public const string STARTING = 'starting';

    public const string PENDING = 'pending';

    public const string RUNNING = 'running';

    public const string COMPLETED = 'completed';

    public const string FAILED = 'failed';

    public const string CANCELLING = 'cancelling';

    public const string CANCELLED = 'cancelled';

    /** The statuses in which the Engine may still create or fill the target. */
    public const array UNFINISHED = [self::STARTING, self::PENDING, self::RUNNING, self::CANCELLING];

    /** The Engine's ended statuses (`WordpressMigration::ENDED_STATUSES`). */
    public const array ENDED = [self::COMPLETED, self::FAILED, self::CANCELLED];

    public const string METHOD_WP_ADMIN = 'wp_admin';

    public const string METHOD_MANUAL_PLUGIN = 'manual_plugin';

    protected $table = 'wordpress_imports';

    protected $fillable = [
        'application_id',
        'engine_migration_id',
        'method',
        'source_url',
        'status',
        'source',
        'engine_status',
        'error',
    ];

    protected static function booted(): void
    {
        static::saved(static fn (self $import) => WordPressImportChanged::dispatch($import->application_id));
    }

    protected function casts(): array
    {
        return [
            'application_id' => 'integer',
            'engine_migration_id' => 'integer',
            'source' => 'encrypted:array',
            'engine_status' => 'array',
        ];
    }

    /**
     * @return BelongsTo<Application, $this>
     */
    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }

    public function isUnfinished(): bool
    {
        return in_array($this->status, self::UNFINISHED, true);
    }

    /**
     * Whether the Engine says the run is dead (`stale`: its heartbeat is older
     * than `WordpressMigration::STALE_MINUTES`) while it still claims to run.
     */
    public function isStale(): bool
    {
        return in_array($this->status, [self::PENDING, self::RUNNING], true)
            && (($this->engine_status ?? [])['stale'] ?? null) === true;
    }
}
