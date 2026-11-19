<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Support\Facades\Cache;
use PanelAlpha\ClientArea\Http\Controllers\Project\AppHealthController;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\ClientArea\Support\Payload;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;

/**
 * What the General page's Source card, the redeploy/upload modals and the
 * deploy-warnings alert show about a container project, read from the Engine:
 * the project inspect report (`GET projects/{u}/inspect`, Engine
 * `SourceInspectionController::project`) and the newest deploy of the history
 * ({@see DeployHistoryService}).
 *
 * Inspect and the history are fetched independently. Inspect answering 403/404
 * (not a container project / unknown) or 422 (no `~/project` checkout yet, or a
 * deploy in the middle of replacing it) is expected and silent; any other
 * Engine failure is reported. One half failing leaves the other in the answer;
 * both failing is "not available" and the CA falls back to the project payload.
 *
 * The Engine keeps deploy steps as shell: `application.commands.install` /
 * `build` are the build-stage commands joined with ` && `, an optional command
 * wrapped as `{ <cmd>; } || true` (`PlatformCommand::tolerantRun`). They are
 * split back into one entry per command here. The migrations are the
 * `upgrade` stage's `run` lines.
 */
final class ProjectSourceReport
{
    /** Seconds an answer is reused; a deploy start and its end forget it sooner. */
    public const int CACHE_SECONDS = 60;

    /** Engine drift fields worth a warning; a moved commit is the Git card's business. */
    private const array DRIFT_FIELDS = ['strategy', 'runtime', 'port'];

    private const array DATABASE_LABELS = [
        'mysql' => 'MySQL',
        'mariadb' => 'MariaDB',
        'postgres' => 'PostgreSQL',
        'postgresql' => 'PostgreSQL',
        'mongo' => 'MongoDB',
        'mongodb' => 'MongoDB',
        'sqlite' => 'SQLite',
        'redis' => 'Redis',
    ];

    public static function cacheKey(int $applicationId): string
    {
        return 'client-area:project-source-report:'.$applicationId;
    }

    /**
     * Forget the cached `/source` and `/app-health` answers of a project: a deploy
     * starting or ending changes both, and the card must not show the old ones.
     */
    public static function forget(Application $application): void
    {
        Cache::forget(self::cacheKey($application->id));
        Cache::forget(AppHealthController::cacheKey($application->id));
    }

    public function __construct(private readonly DeployHistoryService $history) {}

    /**
     * The cached answer for a container project.
     *
     * @return array<string, mixed>
     */
    public function cached(Application $application): array
    {
        /** @var mixed $hit */
        $hit = Cache::get(self::cacheKey($application->id));

        return is_array($hit) ? Payload::object($hit) : $this->fresh($application);
    }

    /**
     * A new answer from the Engine, kept for the next reads. An answer that says
     * the Engine could not be asked is not kept: a brief outage must not stick
     * for the whole cache time.
     *
     * @return array<string, mixed>
     */
    public function fresh(Application $application): array
    {
        $report = $this->build($application);
        if (($report['available'] ?? false) === true) {
            Cache::put(self::cacheKey($application->id), $report, self::CACHE_SECONDS);
        }

        return $report;
    }

    /**
     * @return array<string, mixed>
     */
    public function build(Application $application): array
    {
        $entries = $this->deploys($application);
        $inspect = $this->inspect($application);

        if ($entries === null && $inspect === null) {
            return ['available' => false];
        }

        $latest = $entries[0] ?? null;
        $running = $latest?->status === DeployState::STATUS_RUNNING;
        $inspect ??= [];
        $app = Payload::object($inspect['application'] ?? null);

        return [
            'available' => true,
            'stack' => $this->stack($inspect, $app),
            'database' => $inspect === [] ? null : $this->database($inspect, $app),
            'last_deploy' => $latest === null ? null : $this->lastDeploy($application, $latest, $inspect),
            'deploy_steps' => $this->steps($app),
            // Inspect has no mid-deploy guard: it may read a checkout that is
            // being replaced and report a false not-deployable or drift.
            'warnings' => $running ? [] : $this->warnings($inspect, $app),
        ];
    }

    /**
     * @return list<DeployEntry>|null null when the history could not be read
     */
    private function deploys(Application $application): ?array
    {
        try {
            return $this->history->history($application);
        } catch (EngineException|EngineValidationException $e) {
            report($e);

            return null;
        }
    }

    /**
     * @return array<string, mixed>|null null when the Engine has no report
     */
    private function inspect(Application $application): ?array
    {
        try {
            return (new ProjectsApi($application->engine()))->inspect($application->engineProject());
        } catch (EngineValidationException) {
            return null;
        } catch (EngineRequestException $e) {
            if (! in_array($e->engineStatus, [403, 404], true)) {
                report($e);
            }

            return null;
        } catch (EngineException $e) {
            report($e);

            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $inspect
     * @param  array<string, mixed>  $app
     * @return array{label: string, runtime: string|null}|null
     */
    private function stack(array $inspect, array $app): ?array
    {
        $metadata = Payload::object($inspect['metadata'] ?? null);
        $label = null;
        $candidates = [
            Payload::nullableString($app['label'] ?? null),
            Payload::nullableString($metadata['framework'] ?? null),
            Payload::nullableString($app['platform'] ?? null),
        ];
        foreach ($candidates as $candidate) {
            if ($candidate !== null && $candidate !== '') {
                $label = $candidate;
                break;
            }
        }

        if ($label === null) {
            return null;
        }

        return ['label' => $label, 'runtime' => Payload::nullableString($app['runtime'] ?? null)];
    }

    /**
     * @param  array<string, mixed>  $inspect
     * @param  array<string, mixed>  $app
     * @return array{present: bool, label: string|null}
     */
    private function database(array $inspect, array $app): array
    {
        $name = Payload::nullableString($app['database'] ?? null);
        if ($name === null || $name === '') {
            foreach (Payload::objects($inspect['services'] ?? null) as $service) {
                if (Payload::nullableString($service['role'] ?? null) !== 'datastore') {
                    continue;
                }
                $engine = Payload::nullableString($service['engine'] ?? null);
                $name = $engine !== null && $engine !== '' && $engine !== '0' ? $engine : Payload::nullableString($service['name'] ?? null);
                break;
            }
        }

        if ($name === null || $name === '') {
            return ['present' => false, 'label' => null];
        }

        return ['present' => true, 'label' => self::DATABASE_LABELS[strtolower($name)] ?? ucfirst($name)];
    }

    /**
     * The newest deploy of the history, with the project's own waiting state
     * (`applications.onboarding_files_at`): a files project that never got its
     * archive is `running` and `waiting_for_files`.
     *
     * @param  array<string, mixed>  $inspect
     * @return array{status: string, finished_at: string|null, commit: string|null, branch: string|null, waiting_for_files: bool}
     */
    private function lastDeploy(Application $application, DeployEntry $latest, array $inspect): array
    {
        $deployment = Payload::object($inspect['deployment'] ?? null);

        return [
            'status' => $latest->status,
            'finished_at' => $latest->finishedAt?->toJSON(),
            // The snapshot describes the last deploy that finished; while one
            // runs it is still the previous one.
            'commit' => Payload::nullableString($deployment['commit'] ?? null),
            'branch' => Payload::nullableString($deployment['branch'] ?? null),
            // A files project whose files have not arrived yet: the Engine's
            // waiting create deploy, or the create of a project still in files
            // onboarding (that one is an Engine task).
            'waiting_for_files' => $latest->waitingForFiles || $application->onboarding_files_at !== null,
        ];
    }

    /**
     * @param  array<string, mixed>  $app
     * @return array<string, array{commands: list<string>, skippable: bool}>
     */
    private function steps(array $app): array
    {
        $commands = Payload::object($app['commands'] ?? null);
        $stages = Payload::object($app['stages'] ?? null);

        $migrations = [];
        foreach (Payload::objects($stages['upgrade'] ?? null) as $command) {
            $run = trim(Payload::string($command['run'] ?? null));
            if ($run !== '') {
                $migrations[] = $run;
            }
        }

        // Skippable only when the Engine announces it (DeploySkip).
        $skippable = DeploySkip::supportedCategories($app);

        return [
            'dependencies' => ['commands' => self::splitCommands($commands['install'] ?? null), 'skippable' => in_array('dependencies', $skippable, true)],
            'build' => ['commands' => self::splitCommands($commands['build'] ?? null), 'skippable' => in_array('build', $skippable, true)],
            'migrations' => ['commands' => $migrations, 'skippable' => in_array('migrations', $skippable, true)],
        ];
    }

    /**
     * One entry per command of an Engine-joined shell line: split on the
     * top-level ` && `, unwrap `{ <cmd>; } || true`, drop a bare `true`.
     *
     * @return list<string>
     */
    public static function splitCommands(mixed $joined): array
    {
        $joined = Payload::nullableString($joined);
        if ($joined === null || trim($joined) === '') {
            return [];
        }

        $parts = [];
        $depth = 0;
        $quote = null;
        $current = '';
        $length = strlen($joined);
        for ($i = 0; $i < $length; $i++) {
            $char = $joined[$i];
            if ($quote !== null) {
                if ($char === '\\' && $quote === '"' && $i + 1 < $length) {
                    $current .= $char.$joined[++$i];

                    continue;
                }
                if ($char === $quote) {
                    $quote = null;
                }
            } elseif ($char === '"' || $char === "'") {
                $quote = $char;
            } elseif ($char === '{' || $char === '(') {
                $depth++;
            } elseif (($char === '}' || $char === ')') && $depth > 0) {
                $depth--;
            } elseif ($depth === 0 && substr($joined, $i, 4) === ' && ') {
                $parts[] = $current;
                $current = '';
                $i += 3;

                continue;
            }
            $current .= $char;
        }
        $parts[] = $current;

        $commands = [];
        foreach ($parts as $part) {
            $part = trim($part);
            if (preg_match('/^\{ (.*); \} \|\| true$/s', $part, $m) === 1) {
                $part = trim($m[1]);
            }
            if ($part !== '' && $part !== 'true') {
                $commands[] = $part;
            }
        }

        return $commands;
    }

    /**
     * @param  array<string, mixed>  $inspect
     * @param  array<string, mixed>  $app
     * @return list<array{code: string, severity: string, title: null, details: list<string>}>
     */
    private function warnings(array $inspect, array $app): array
    {
        if ($inspect === []) {
            return [];
        }

        $warnings = [];

        if (($app['deployable'] ?? null) === false) {
            $issue = Payload::nullableString($app['issue'] ?? null);
            $issue = $issue === null ? null : EngineText::redact($issue);
            $warnings[] = [
                'code' => 'deploy.not_deployable',
                'severity' => 'error',
                'title' => null,
                'details' => $issue === null || $issue === '' ? [] : [$issue],
            ];
        }

        $deployment = Payload::object($inspect['deployment'] ?? null);
        $lines = [];
        foreach (Payload::objectsOrStrings($deployment['warnings'] ?? null) as $warning) {
            // The Engine stores each warning as a finding (`{code, message}`);
            // an older one stored the sentences alone.
            $line = is_string($warning) ? $warning : Payload::nullableString($warning['message'] ?? null);
            $line = $line === null ? '' : trim(EngineText::redact($line));
            if ($line !== '') {
                $lines[] = $line;
            }
        }
        if ($lines !== []) {
            $warnings[] = ['code' => 'deploy.last_deploy_warnings', 'severity' => 'warning', 'title' => null, 'details' => $lines];
        }

        foreach (Payload::objects($inspect['drift'] ?? null) as $drift) {
            $field = Payload::string($drift['field'] ?? null);
            if (! in_array($field, self::DRIFT_FIELDS, true)) {
                continue;
            }
            $warnings[] = [
                'code' => 'deploy.drift.'.$field,
                'severity' => 'warning',
                'title' => null,
                'details' => [EngineText::redact(self::scalar($drift['deployed'] ?? null).' → '.self::scalar($drift['detected'] ?? null))],
            ];
        }

        return $warnings;
    }

    private static function scalar(mixed $value): string
    {
        return is_scalar($value) ? (string) $value : (string) json_encode($value);
    }
}
