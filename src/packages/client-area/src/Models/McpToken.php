<?php

namespace PanelAlpha\ClientArea\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One Engine MCP token the panel minted for a Client Area user. The Engine
 * owns the token (secret, revocation, project
 * scope); the panel owns only the user ↔ token relation. A token without a row
 * is not a Connect AI token.
 *
 * A token the user deleted (or the Engine no longer lists) keeps its row,
 * soft-deleted, so its calls stay in the user's activity log; every other
 * read excludes it.
 *
 * @property int $id
 * @property int $user_id
 * @property int $engine_id
 * @property int $engine_token_id
 * @property string $name
 * @property string|null $token_digest SHA-256 of the plain-text token, to tell
 *                                     two Engines' equal token ids apart); null
 *                                     for an adopted token
 * @property \Illuminate\Support\Carbon|null $deleted_at
 */
class McpToken extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'user_id',
        'engine_id',
        'engine_token_id',
        'name',
        'token_digest',
    ];

    /** @var list<string> */
    protected $hidden = ['token_digest'];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'engine_id' => 'integer',
            'engine_token_id' => 'integer',
        ];
    }
}
