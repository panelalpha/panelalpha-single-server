<?php

namespace PanelAlpha\ClientArea\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use PanelAlpha\ClientArea\Models\Application;

/**
 * A panel-only label attached to one application. The label's
 * title/color are copied on attach, as the old panel did, so the project list
 * needs no extra query.
 *
 * @property int $application_id
 * @property int|null $label_id
 * @property string $title
 * @property string $color
 */
class ApplicationLabel extends Model
{
    protected $fillable = [
        'application_id',
        'label_id',
        'title',
        'color',
    ];

    /**
     * @return BelongsTo<Application, $this>
     */
    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }

    /**
     * @return BelongsTo<Label, $this>
     */
    public function label(): BelongsTo
    {
        return $this->belongsTo(Label::class);
    }
}
