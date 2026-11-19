<?php

namespace PanelAlpha\ClientArea\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * The panel's state of one "Install WordPress" on a classic project
 * (Engine 2.2.0): the Engine composes no install task, so `InstallWordPressJob`
 * records it here for `async_status.installation` and retry-install.
 *
 * @property int $id
 * @property int $application_id
 * @property string $status in_progress | finished | failed
 * @property array<string, mixed> $params the install form, encrypted at rest
 * @property string|null $error
 */
class WordPressInstall extends Model
{
    public const string IN_PROGRESS = 'in_progress';

    public const string FINISHED = 'finished';

    public const string FAILED = 'failed';

    protected $table = 'wordpress_installs';

    protected $fillable = [
        'application_id',
        'status',
        'params',
        'error',
    ];

    protected function casts(): array
    {
        return [
            'application_id' => 'integer',
            'params' => 'encrypted:array',
        ];
    }
}
