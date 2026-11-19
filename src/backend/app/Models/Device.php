<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * A remembered device for a user (section B). Live logins live in `sessions`;
 * this records the parsed fingerprint so the CA can match a session to a
 * device and "forget" it.
 *
 * @property \Illuminate\Support\Carbon|null $last_login
 */
class Device extends Model
{
    protected $fillable = [
        'authenticatable_type',
        'authenticatable_id',
        'ip_address',
        'user_agent',
        'browser',
        'device',
        'detection',
        'last_login',
    ];

    protected function casts(): array
    {
        return [
            'last_login' => 'datetime',
        ];
    }

    /**
     * @return MorphTo<Model, $this>
     */
    public function authenticatable(): MorphTo
    {
        return $this->morphTo();
    }
}
