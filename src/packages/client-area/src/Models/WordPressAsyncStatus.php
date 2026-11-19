<?php

namespace PanelAlpha\ClientArea\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Panel-owned async state of one WordPress operation: plugin/
 * theme install & update, plus the core update the Engine keeps no status for
 *The Engine `wp/*` calls are synchronous and keep no per-item
 * status, but the CA shows `async_status` on every plugin/theme row while a job
 * runs and gates the core update on `async_status.update`.
 *
 * @property int $id
 * @property int $application_id
 * @property string $type plugin | theme | core
 * @property string $name
 * @property string $action install | update
 * @property string $status pending | in_progress | finished | failed
 */
class WordPressAsyncStatus extends Model
{
    public const string PLUGIN = 'plugin';
    public const string THEME = 'theme';

    /** The project's core update – surfaced as `async_status.update`. */
    public const string CORE = 'core';

    public const string PENDING = 'pending';
    public const string IN_PROGRESS = 'in_progress';
    public const string FINISHED = 'finished';
    public const string FAILED = 'failed';

    protected $table = 'wordpress_async_status';

    protected $fillable = [
        'application_id',
        'type',
        'name',
        'action',
        'status',
    ];

    /**
     * @return BelongsTo<Application, $this>
     */
    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }
}
