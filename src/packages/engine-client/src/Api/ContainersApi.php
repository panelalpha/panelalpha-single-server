<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Engine container endpoints for one project. Containers
 * only exist for dind projects; the Engine returns bare `{exit_code, stdout,
 * stderr}` for actions.
 */
final class ContainersApi
{
    /**
     * Compose actions the Engine refuses on a protected project (Engine:
     * core/app/Http/Middleware/EnsureProjectNotProtected.php:28).
     *
     * @var list<string>
     */
    public const array STOPPING_ACTIONS = ['stop', 'down', 'restart'];

    /**
     * Service-level docker actions the Engine refuses on a protected project
     * (Engine: core/app/Http/Middleware/EnsureProjectNotProtected.php:31).
     *
     * @var list<string>
     */
    public const array STOPPING_SERVICE_ACTIONS = ['stop', 'restart'];

    public function __construct(readonly EngineClient $engine) {}

    /**
     * Is the deployed application answering? The Engine probes each port the
     * application publishes from inside the account container (not through
     * the domain): `{healthy: bool|null, serving: string, ports: [...],
     * checks: [...], error?: string}`; `healthy` is null when nothing is
     * published, `serving` is `ok` or what answers instead (`placeholder`,
     * `missing_entry`, `error_page`, `restarting`, `unknown`…). A project that
     * is not a container project is a 403.
     *
     * Engine: core/app/Http/Controllers/User/AppHealthController.php:103-127 -> show,
     * `{data: report}` (`System/Project/Dind/AppHealth.php:223-228`); 403 at :37-40.
     *
     * `$query` takes the Engine's `timeout` (1-30 s per probe) and `attempts`
     * (1-10); the Engine's defaults are 5 and 3.
     *
     * @param  array{timeout?: int, attempts?: int}  $query
     * @return array<string, mixed>
     */
    public function appHealth(EngineProject $project, array $query = []): array
    {
        return Payload::object($this->engine->get($project->enginePath('app/health'), $query)->json('data'));
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('containers'))->json('data'));
    }

    /**
     * Each container's latest sample, taken every minute: `{container_id,
     * name, service, cpu_percent, memory_bytes, memory_limit_bytes,
     * sampled_at}`; `cpu_percent` counts one core as 100.
     *
     * Engine: core/routes/api.php:401 → ProjectMetricsController::containers (without `range`).
     *
     * @return list<array<string, mixed>>
     */
    public function metrics(EngineProject $project): array
    {
        return Payload::objects($this->engine->get($project->enginePath('containers/metrics'))->json('data'));
    }

    /**
     * A stopping action (`stop`, `down`, `restart`) on a protected project is
     * refused before the Engine call (EnsureProjectNotProtected.php:52/135);
     * `start`/`up` pass.
     *
     * @param  array<string, mixed>  $params
     */
    public function projectAction(EngineProject $project, array $params): Response
    {
        if (in_array($params['action'] ?? null, self::STOPPING_ACTIONS, true)) {
            ProjectProtectedException::throwIfProtected($project);
        }

        return $this->engine->post($project->enginePath('containers/action'), $params);
    }

    /**
     * A stopping service action (`stop`, `restart`) on a protected project is
     * refused before the Engine call (EnsureProjectNotProtected.php:53/136);
     * `start` passes.
     *
     * @param  array<string, mixed>  $params
     */
    public function serviceAction(EngineProject $project, string $service, array $params): Response
    {
        if (in_array($params['action'] ?? null, self::STOPPING_SERVICE_ACTIONS, true)) {
            ProjectProtectedException::throwIfProtected($project);
        }

        return $this->engine->post($project->enginePath('containers/'.rawurlencode($service).'/action'), $params);
    }

    /**
     * The service's log as the Engine returns it – `{data: string}`, a plain
     * string the CA shows verbatim (Engine: `ContainerController::logs`).
     */
    public function logs(EngineProject $project, string $service, int $lines = 200): string
    {
        return Payload::nullableString($this->engine->get($project->enginePath('containers/'.rawurlencode($service).'/logs'), ['lines' => $lines])->json('data')) ?? '';
    }
}
