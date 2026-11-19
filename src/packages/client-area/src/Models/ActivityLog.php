<?php

namespace PanelAlpha\ClientArea\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * One panel-side activity entry. Written by LogActivity
 * middleware for every successful mutating Client Area request, read by
 * GET /projects/{id}/logs. `action` is the route name the Client Area
 * translates (`user.instance.redeploy`…); `payload` is whatever the controller
 * put in the request's `activity` attribute. `admin_as_user` marks what an
 * admin did while signed in as the user, which the user's own
 * logs leave out (old `whereNull('admin_as_user')`).
 *
 * @property string $action
 * @property int|null $user_id
 * @property int|null $application_id
 * @property int|null $admin_id
 * @property bool|null $admin_as_user
 * @property string|null $request_method
 * @property string|null $request_uri
 * @property string|null $ip_address
 * @property array<string, mixed>|null $payload
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 */
class ActivityLog extends Model
{
    use Prunable;

    protected $fillable = [
        'action',
        'user_id',
        'application_id',
        'request_method',
        'request_uri',
        'ip_address',
        'payload',
        'admin_id',
        'admin_as_user',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'admin_as_user' => 'boolean',
        ];
    }

    /**
     * Rows past the retention window; the controller's
     * `prune-client-area-tables` schedule entry runs `model:prune` for this
     * model.
     *
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        $days = Payload::int(config('client-area.activity_retention_days', 90)) ?? 90;

        return static::query()->where('created_at', '<', now()->subDays($days));
    }

    /**
     * @return BelongsTo<Model, $this>
     */
    public function user(): BelongsTo
    {
        /** @var class-string<Model> $model */
        $model = config('auth.providers.users.model');

        return $this->belongsTo($model);
    }

    /**
     * @return BelongsTo<Application, $this>
     */
    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }
}
