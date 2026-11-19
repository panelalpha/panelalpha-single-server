<?php

namespace PanelAlpha\ClientArea\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The end of a watched deploy task's log, kept for a deploy the Engine's history
 * cannot list: the task ended without
 * naming a deploy (it failed or was cancelled before the deploy log started, or
 * an Engine before `6763cdc64`), or a failed create's rollback deleted the deploy
 * log (Engine `Jobs/DeployProject.php:144-166`, `Lib/Task/DeployLogTail.php`).
 * The task log is the only record of why it failed, and the Engine prunes tasks,
 * so the watcher keeps the last lines here, one row per Engine task. Everything
 * else in the deploy history is the Engine's (`GET /projects/{u}/deploys`).
 *
 * `lines` holds JSON lines in the deploy log's `{ts, stage, level, msg}` shape,
 * so the history renders them like any deploy log. Bounded: a project keeps its
 * newest {@see self::KEEP} rows, as the Engine keeps its newest deploy logs.
 *
 * @property int $id
 * @property int $application_id
 * @property int $engine_task_id
 * @property string|null $engine_deploy_id
 * @property string $source_type
 * @property string $status
 * @property string|null $lines
 * @property string|null $error
 * @property Carbon|null $started_at
 * @property Carbon|null $finished_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class DeployTaskTail extends Model
{
    /** The Engine's default `DEPLOY_LOG_KEEP`: tails kept per project. */
    public const int KEEP = 10;

    protected $fillable = [
        'application_id',
        'engine_task_id',
        'engine_deploy_id',
        'source_type',
        'status',
        'lines',
        'error',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'engine_task_id' => 'integer',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Application, $this>
     */
    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }

    /**
     * Store (or replace) the tail of one Engine task and keep the project's newest
     * {@see self::KEEP} tails.
     *
     * @param  list<array{ts: int, stage: string|null, level: string, msg: string}>  $lines
     */
    public static function record(
        Application $application,
        int $taskId,
        ?string $deployId,
        string $sourceType,
        string $status,
        ?string $error,
        array $lines,
        ?Carbon $startedAt,
    ): self {
        $tail = static::query()->updateOrCreate(
            ['application_id' => $application->id, 'engine_task_id' => $taskId],
            [
                'engine_deploy_id' => $deployId,
                'source_type' => $sourceType,
                'status' => $status,
                'error' => $error,
                'lines' => implode("\n", array_map(
                    static fn (array $line): string => (string) json_encode($line, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                    $lines,
                )),
                'started_at' => $startedAt ?? now(),
                'finished_at' => now(),
            ],
        );

        $kept = static::query()
            ->where('application_id', $application->id)
            ->orderByDesc('id')
            ->limit(self::KEEP)
            ->pluck('id');
        static::query()
            ->where('application_id', $application->id)
            ->whereNotIn('id', $kept)
            ->delete();

        return $tail;
    }

    /**
     * The stored lines, each `{ts, stage, level, msg}` like the Engine's.
     *
     * @return list<array{ts: int, stage: string|null, level: string, msg: string}>
     */
    public function parsedLines(): array
    {
        $lines = [];
        foreach (preg_split('/\r?\n/', (string) $this->lines) ?: [] as $raw) {
            if ($raw === '') {
                continue;
            }
            /** @var mixed $decoded */
            $decoded = json_decode($raw, true);
            if (! is_array($decoded)) {
                continue;
            }
            $lines[] = [
                'ts' => Payload::int($decoded['ts'] ?? null) ?? 0,
                'stage' => Payload::nullableString($decoded['stage'] ?? null),
                'level' => Payload::nullableString($decoded['level'] ?? null) ?? 'dim',
                'msg' => Payload::string($decoded['msg'] ?? ''),
            ];
        }

        return $lines;
    }
}
