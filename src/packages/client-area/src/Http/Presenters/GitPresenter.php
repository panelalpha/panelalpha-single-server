<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Shapes the git payload the Client Area's Git page reads (old
 * InstanceGitResource).
 *
 * Most fields come from the Engine's `GET git/status` (`connected`, `branch`,
 * `dirty`, `repository_exists`, `commits_ahead`/`behind`); the panel adds the
 * deploy bookkeeping the Engine doesn't keep (last deployed commit, drift) as
 * explicit placeholders rather than inventing Engine keys.
 */
final class GitPresenter
{
    /**
     * The CA's branch list is a sorted `string[]`.
     *
     * @param  list<array<string, mixed>|string>  $branches  Engine `git/branches` rows
     *         (`{name: …}` objects or bare branch names – W15)
     * @return list<string>
     */
    public function branches(array $branches): array
    {
        $names = [];
        foreach ($branches as $branch) {
            $name = is_array($branch) ? Payload::nullableString($branch['name'] ?? null) : $branch;
            if (is_string($name) && $name !== '') {
                $names[] = $name;
            }
        }

        $names = array_values(array_unique($names));
        sort($names);

        return $names;
    }

    /**
     * The project's deploy key as the Client Area reads it. The Engine's reply
     * never carries the private key.
     *
     * @param  array<string, mixed>  $key  Engine deploy-key `data`
     * @return array{public_key: string, fingerprint: string, created: bool, hosts: list<array{host: string, pinned: string}>}
     */
    public function deployKey(array $key): array
    {
        $hosts = [];
        foreach (Payload::objects($key['hosts'] ?? null) as $host) {
            $hosts[] = [
                'host' => Payload::string($host['host'] ?? null),
                'pinned' => Payload::string($host['pinned'] ?? null),
            ];
        }

        return [
            'public_key' => Payload::string($key['public_key'] ?? null),
            'fingerprint' => Payload::string($key['fingerprint'] ?? null),
            'created' => ($key['created'] ?? false) === true,
            'hosts' => $hosts,
        ];
    }

    /**
     * The CA reads `{commits, from, to, total}` where `from` is the commit the
     * panel last deployed and `to` is the branch tip (old `listCommitsBetween`).
     * Engine `git/commits` returns the branch log newest-first.
     *
     * `commits` are only those newer than `from`: when the deployed commit is in
     * the fetched log, the rows before it, so `total` is the number of commits a
     * redeploy would bring (0 right after a deploy). When `from` is null or not
     * in the log (older than the fetched page, or on another branch) all rows are
     * returned. `total: 0` does not mean there is nothing to redeploy: the same
     * commit can be rebuilt.
     *
     * @param  list<array<string, mixed>>  $commits  Engine `git/commits` rows
     * @return array{commits: list<array<string, mixed>>, from: string|null, to: string|null, total: int}
     */
    public function commits(Application $application, array $commits): array
    {
        $rows = array_values(array_filter($commits, 'is_array'));
        $tip = Payload::nullableString($rows[0]['hash'] ?? null);
        $from = $application->gitLastCommitHash();

        if ($from !== null && $from !== '') {
            foreach ($rows as $index => $row) {
                if (Payload::nullableString($row['hash'] ?? null) === $from) {
                    $rows = array_slice($rows, 0, $index);
                    break;
                }
            }
        }

        return [
            'commits' => $rows,
            'from' => $from,
            'to' => is_string($tip) ? $tip : null,
            'total' => count($rows),
        ];
    }

    /**
     * @param  array<string, mixed>  $status  Engine git/status `data`
     * @param  array<string, mixed>  $deployHook  Engine deploy-hook `data` (may be empty)
     * @return array<string, mixed>
     */
    public function present(Application $application, array $status, array $deployHook = []): array
    {
        $connected = (bool) ($status['connected'] ?? false);
        $branch = Payload::nullableString($status['branch'] ?? null);
        $deliveries = Payload::objects($deployHook['deliveries'] ?? null);
        // The Engine's `dirty` flag is the old panel's local-repo drift status:
        // `clean`/`dirty` when the repository exists, null when it does not
        // (old ApplicationGitBinding::getStatusPorcelain, Git.vue:831).
        $repositoryExists = Payload::bool($status['repository_exists'] ?? null);
        $dirty = Payload::bool($status['dirty'] ?? null);
        $driftStatus = $repositoryExists === false || ! is_bool($dirty)
            ? null
            : ($dirty ? 'dirty' : 'clean');

        return [
            'connected' => $connected,
            'repo_url' => $status['remote_url'] ?? $application->gitRepositoryUrl(),
            'branch' => $branch,
            'pair_branch' => null,
            // The old repository's `auth_type`: `pat` while the panel holds a
            // readable provider token, null without one (connected as public,
            // over SSH, or a token a changed APP_KEY cannot decrypt). The CA
            // asks for a token when it is null, as auto-deploy needs one.
            'auth_type' => $application->gitToken() !== null ? 'pat' : null,
            'last_deployed_commit_hash' => $application->gitLastCommitHash(),
            'last_deployed_commit_message' => $application->gitLastCommitMessage(),
            'last_deployed_commit_at' => $application->gitLastCommitAt()?->toJSON(),
            'has_synced_once' => $connected,
            'drift_status' => $driftStatus,
            'commits_behind' => $status['commits_behind'] ?? null,
            'commits_ahead' => $status['commits_ahead'] ?? null,
            'remote_branch_exists' => null,
            'local_repository_exists' => $repositoryExists,
            // Who owns the checkout (Engine GitController::status: `deploy` when
            // the project deploys from its repository). The Engine refuses
            // disconnect and push for such a project with 422 "Git is managed by
            // deploy." (WorkTree.php:918-921, :1242-1247); a client can hide them.
            'managed_by' => Payload::nullableString($status['managed_by'] ?? null),
            'show_drift_banner' => false,
            // Auto-deploy is on when the Engine hook exists AND the panel
            // registered the provider webhook. The Engine never
            // returns an `enabled` flag, so the panel's stored id decides.
            'auto_deploy_enabled' => $deployHook !== [] && $application->git_webhook_id !== null,
            'webhook_registered' => $application->git_webhook_id !== null,
            'auto_deploy_last_triggered_at' => $deliveries[0]['created_at'] ?? null,
            // The Engine's self-signed warning reaches the CA's connection-health
            // banner instead of being swallowed.
            'connection_health' => $this->connectionHealth($deployHook),
            'async_status' => [
                'git_attach' => $status['connecting'] ?? null,
                'git_pull' => null,
                'git_auto_deploy' => null,
            ],
        ];
    }

    /**
     * The TLS warning the Engine attaches to a self-signed deploy hook, in the
     * shape the CA's connection-health banner reads (`Git.vue:913,916`).
     *
     * @param  array<string, mixed>  $deployHook
     * @return array{status: string, reason: string|null}
     */
    private function connectionHealth(array $deployHook): array
    {
        $tls = Payload::object($deployHook['tls'] ?? null);
        $warning = Payload::nullableString($tls['warning'] ?? ($deployHook['warning'] ?? null));

        if (is_string($warning) && $warning !== '') {
            return ['status' => 'warning', 'reason' => $warning];
        }

        return ['status' => 'ok', 'reason' => null];
    }
}
