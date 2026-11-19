<?php

namespace PanelAlpha\ClientArea\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One successful `ApplicationSynchronizer::sync()` per Engine – the persistent
 * "never synced" marker. A row exists even when
 * the Engine has zero projects, unlike a check on `applications.synced_at`.
 *
 * @property int $id
 * @property int $engine_id
 * @property Carbon $synced_at
 */
class EngineSyncState extends Model
{
    protected $fillable = [
        'engine_id',
        'synced_at',
    ];

    protected function casts(): array
    {
        return [
            'engine_id' => 'integer',
            'synced_at' => 'datetime',
        ];
    }
}
