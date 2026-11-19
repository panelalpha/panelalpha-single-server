<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Models\GitOperation;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use Throwable;

/**
 * Which commit is deployed, and the write of the three "last deployed commit"
 * columns (`git_last_commit_hash|message|at`) together, so the hash, the
 * message and the date never drift apart.
 *
 * The deployed commit comes from the Engine deploy list, newest first
 * (`GET projects/{u}/deploys`, `core/app/Lib/Deploy/DeployLog/DeployHistory.php:109-118`;
 * item schema `core/app/OpenApi/Schemas/DeployHistoryItemSchema.php`). Its
 * `commit` is the deploy start line commit, else the task's commit, else the
 * hook delivery's commit. The message and the UTC date come from one
 * `git/commits` read (`System/Project/Git/WorkTree.php:461`), parsed by
 * {@see GitOperation::commitAttributes()}.
 */
final class DeployedCommit
{
    /**
     * How many newest commits a lookup reads. A deployed commit older than
     * this is not found, and its message and date stay null.
     */
    public const int LOOKUP_LIMIT = 50;

    /** How long a failed message and date read is remembered for a retry. */
    private const int RETRY_TTL_HOURS = 24;

    /**
     * The commit of the newest `success` or `partial` deploy in a deploy list,
     * or null when there is none or that deploy names no commit (an archive
     * deploy).
     *
     * @param  list<array<string, mixed>>  $deploys  Engine deploy list items, newest first
     * @return array{commit: string, branch: string|null}|null
     */
    public static function newestDeployed(array $deploys): ?array
    {
        foreach ($deploys as $deploy) {
            $status = Payload::nullableString($deploy['status'] ?? null);
            if ($status !== 'success' && $status !== 'partial') {
                continue;
            }

            $commit = Payload::nullableString($deploy['commit'] ?? null);
            if ($commit === null || $commit === '') {
                return null;
            }

            $branch = Payload::nullableString($deploy['branch'] ?? null);

            return [
                'commit' => $commit,
                'branch' => $branch === null || $branch === '' ? null : $branch,
            ];
        }

        return null;
    }

    /**
     * Record $hash as the last deployed commit. Message and date come from one
     * `git/commits` read on $branch (the application's branch when null). When
     * the hash is not in that list, or the read fails, the message and date are
     * null: the previous commit's text is never kept. Best effort: a failed
     * read is reported and never fails the caller. A failed read (not a hash
     * missing from the list) is remembered, so {@see self::retryPending()} can
     * fill the message and date on a later run.
     */
    public static function record(Application $application, string $hash, ?string $branch = null): void
    {
        if ($application->git_last_commit_hash === $hash && $application->gitLastCommitMessage() !== null) {
            return;
        }

        $row = ['hash' => $hash];
        $key = self::retryKey($application);

        try {
            $rows = (new ProjectsApi($application->engine()))->gitCommits(
                $application->engineProject(),
                $branch ?? $application->gitBranch(),
                self::LOOKUP_LIMIT,
            );

            foreach ($rows as $candidate) {
                if (Payload::nullableString($candidate['hash'] ?? null) === $hash) {
                    $row = $candidate;

                    break;
                }
            }

            Cache::forget($key);
        } catch (Throwable $e) {
            report($e);
            Cache::put($key, ['hash' => $hash, 'branch' => $branch], now()->addHours(self::RETRY_TTL_HOURS));
        }

        self::store($application, GitOperation::commitAttributes($row));
    }

    /**
     * Read the message and date again for a commit whose last read failed.
     * Does nothing when no read failed, or when the recorded hash has moved on.
     */
    public static function retryPending(Application $application): void
    {
        $pending = Cache::get(self::retryKey($application));
        if (! is_array($pending)) {
            return;
        }

        $hash = $pending['hash'] ?? null;
        if (! is_string($hash) || $hash !== $application->git_last_commit_hash) {
            return;
        }

        self::record($application, $hash, Payload::nullableString($pending['branch'] ?? null));
    }

    private static function retryKey(Application $application): string
    {
        return 'deployed-commit-retry:'.$application->id;
    }

    /**
     * Write the three columns from {@see GitOperation::commitAttributes()}
     * output. No Engine call. Does nothing when the commit hash is null or
     * empty, so an empty array (no head commit read) changes nothing.
     *
     * @param  array<string, mixed>  $commit  `commit_hash`, `commit_message`, `commit_at`
     */
    public static function store(Application $application, array $commit): void
    {
        $hash = Payload::nullableString($commit['commit_hash'] ?? null);
        if ($hash === null || $hash === '') {
            return;
        }

        $application->forceFill([
            'git_last_commit_hash' => $hash,
            'git_last_commit_message' => Payload::nullableString($commit['commit_message'] ?? null),
            'git_last_commit_at' => self::asCarbon($commit['commit_at'] ?? null),
        ])->save();
    }

    private static function asCarbon(mixed $value): ?Carbon
    {
        return $value instanceof Carbon ? $value : null;
    }
}
