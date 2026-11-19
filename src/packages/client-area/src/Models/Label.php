<?php

namespace PanelAlpha\ClientArea\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Panel-only label the user can attach to their projects.
 * The Engine knows nothing about labels.
 *
 * @property string $title
 * @property string $color
 */
class Label extends Model
{
    protected $fillable = [
        'user_id',
        'title',
        'color',
    ];

    protected $hidden = [
        'user_id',
        'created_at',
        'updated_at',
    ];
}
