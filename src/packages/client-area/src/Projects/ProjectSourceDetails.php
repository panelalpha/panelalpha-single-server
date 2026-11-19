<?php

namespace PanelAlpha\ClientArea\Projects;

use DateTimeInterface;
use Illuminate\Support\Facades\Cache;
use PanelAlpha\ClientArea\Jobs\Application\RefreshProjectSourceJob;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;

/**
 * What the Source card of a deployed (git/files) project shows on its General
 * page (old `InstanceSourceResource`, packages/api/app/Http/Resources/
 * InstanceSourceResource.php, and the cached `details.detected_stack` of
 * `ProjectStackDetector`): the stack label, the database container and the
 * last deploy. The CA reads `details.detected_stack.label`,
 * `source.database {present, label}` and `source.last_deploy {status,
 * finished_at}` (`FilesSourceInfoCard.vue:101-134`, `GitSourceInfoCard.vue`).
 *
 * Only the single project answer carries it, and the answer never calls the
 * Engine: it reads the facts from the cache and, when they are
 * missing or older than FRESH_SECONDS, queues {@see RefreshProjectSourceJob},
 * which reads the containers and the deploy history. Stale facts are still
 * shown while the refresh runs (kept KEEP_SECONDS), so the card never falls
 * back to empty; only a project never refreshed – or one whose Engine reads
 * failed – shows the card's defaults. A cached `running` deploy is the
 * exception: it is shown only until RUNNING_TRUST_SECONDS, so a deploy that
 * ended (and a refresh that never replaced its facts) cannot keep the card
 * waiting.
 */
final class ProjectSourceDetails
{
    /** Facts older than this are still shown, and the view queues a refresh. */
    public const FRESH_SECONDS = 300;

    /** How long refreshed facts are kept at all. */
    public const KEEP_SECONDS = 86400;

    /**
     * How long a `running` last deploy is shown when the facts are not
     * refreshed: a deploy that ended while the refresh could not run must not
     * keep the Upload new version dialog waiting for the facts' whole life.
     */
    public const RUNNING_TRUST_SECONDS = 1800;

    /** @var list<string> */
    private const DATABASE_SERVICE_NAMES = ['db', 'database', 'postgres', 'postgresql', 'mysql', 'mariadb'];

    /** @var list<string> */
    private const DATABASE_ENGINES = ['mariadb', 'mysql', 'postgres', 'postgresql'];

    public function __construct(
        private readonly StackDetector $stacks,
        private readonly DeployHistoryService $history,
    ) {}

    /**
     * The presented project with its Source card facts filled in; a project
     * without a `source` (WordPress, a classic site) is returned unchanged.
     *
     * @param  array<string, mixed>  $project
     * @return array<string, mixed>
     */
    public function apply(Application $application, array $project): array
    {
        $source = $project['source'] ?? null;
        if (! is_array($source)) {
            return $project;
        }

        /** @var mixed $cached */
        $cached = Cache::get(self::cacheKey($application));
        $facts = is_array($cached) ? Payload::object($cached['facts'] ?? null) : [];
        $refreshedAt = is_array($cached) ? Payload::int($cached['refreshed_at'] ?? null) : null;
        if ($refreshedAt === null || $refreshedAt < now()->getTimestamp() - self::FRESH_SECONDS) {
            RefreshProjectSourceJob::dispatch($application->id)->onConnection('database');
        }
        if ($facts === []) {
            return $project;
        }

        $details = Payload::object($project['details'] ?? []);
        $details['detected_stack'] = [
            'label' => Payload::nullableString($facts['label'] ?? null),
            'services' => Payload::objects($facts['services'] ?? []),
        ];
        $project['details'] = $details;

        $database = Payload::object($facts['database'] ?? []);
        $source['database'] = $database === [] ? ['present' => false, 'label' => null] : $database;
        $lastDeploy = Payload::object($facts['last_deploy'] ?? []);
        if (! $this->runningTrusted($lastDeploy, $refreshedAt)) {
            $lastDeploy = [];
        }
        $source['last_deploy'] = $lastDeploy === [] ? null : $lastDeploy;
        $project['source'] = $source;

        return $project;
    }

    /**
     * Whether a cached `running` deploy is still shown: only while the facts
     * were refreshed recently. A files project waiting for its archive is the
     * one running deploy that stays (the CA uploads instead of waiting for it).
     *
     * @param  array<string, mixed>  $lastDeploy
     */
    private function runningTrusted(array $lastDeploy, ?int $refreshedAt): bool
    {
        if (Payload::nullableString($lastDeploy['status'] ?? null) !== DeployState::STATUS_RUNNING
            || ($lastDeploy['waiting_for_files'] ?? false) === true) {
            return true;
        }

        return $refreshedAt !== null && $refreshedAt >= now()->getTimestamp() - self::RUNNING_TRUST_SECONDS;
    }

    /**
     * Forget the cached facts: the next project answer queues a fresh read.
     */
    public static function forget(Application $application): void
    {
        Cache::forget(self::cacheKey($application));
    }

    /**
     * Read the facts from the Engine and keep them (the queued refresh).
     */
    public function refresh(Application $application): void
    {
        Cache::put(
            self::cacheKey($application),
            ['facts' => $this->facts($application), 'refreshed_at' => now()->getTimestamp()],
            self::KEEP_SECONDS,
        );
    }

    public static function cacheKey(Application $application): string
    {
        return 'client-area:project-source:'.$application->id;
    }

    /**
     * @return array{label: string, services: list<array<string, mixed>>, database: array{present: bool, label: string|null}, last_deploy: array{status: string, finished_at: string|null, waiting_for_files: bool}|null}
     */
    private function facts(Application $application): array
    {
        $stack = $this->stacks->detect($application);
        $services = Payload::objects($stack['services'] ?? []);

        // The Engine's own recipe label ("PanelAlpha", "Node.js", …) names a
        // project built from a Dockerfile better than its local image
        // (`project-app`); the container label is the fallback.
        $details = Payload::object(($application->engine_payload ?? [])['details'] ?? []);
        $label = Payload::nullableString($details['deploy_label'] ?? null);

        return [
            'label' => $label !== null && $label !== '' ? $label : Payload::string($stack['label'] ?? ''),
            'services' => $services,
            'database' => $this->database($services),
            'last_deploy' => $this->lastDeploy($application),
        ];
    }

    /**
     * The newest deploy (old `deployLogs()->first()`), in the CA's status
     * vocabulary (`finished`, `failed`, `running`, `cancelled`). A files project
     * whose files have not arrived yet is `running` and `waiting_for_files`: the
     * Upload new version dialog uploads instead of waiting for its end.
     *
     * @return array{status: string, finished_at: string|null, waiting_for_files: bool}|null
     */
    private function lastDeploy(Application $application): ?array
    {
        try {
            $newest = $this->history->history($application)[0] ?? null;
        } catch (EngineException|EngineValidationException $e) {
            report($e);

            return null;
        }

        if ($newest === null) {
            return null;
        }

        return [
            'status' => $newest->status,
            'finished_at' => $newest->finishedAt?->format(DateTimeInterface::ATOM),
            // The Engine's waiting create deploy, or the create of a project the
            // panel has not deployed yet (an Engine task, not a task-less one).
            'waiting_for_files' => $newest->waitingForFiles || $application->onboarding_files_at !== null,
        ];
    }

    /**
     * The first database container (old `databaseFromStack`): by service name
     * or image, labelled with the engine's name and the image tag.
     *
     * @param  list<array<string, mixed>>  $services
     * @return array{present: bool, label: string|null}
     */
    private function database(array $services): array
    {
        foreach ($services as $service) {
            $name = strtolower(trim(Payload::string($service['name'] ?? '')));
            $image = Payload::nullableString($service['image'] ?? null);
            $basename = StackDetector::imageBasename($image);
            $engine = strtolower($basename ?? $name);
            if (! in_array($name, self::DATABASE_SERVICE_NAMES, true) && ! in_array($engine, self::DATABASE_ENGINES, true)) {
                continue;
            }

            $display = match ($engine) {
                'mariadb' => 'MariaDB',
                'mysql' => 'MySQL',
                'postgres', 'postgresql' => 'PostgreSQL',
                default => ucfirst($basename ?? $name),
            };
            $tag = StackDetector::imageTag($image);

            return ['present' => true, 'label' => $tag !== null && $tag !== '' ? $display.' '.$tag : $display];
        }

        return ['present' => false, 'label' => null];
    }
}
