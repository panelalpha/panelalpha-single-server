<?php

namespace PanelAlpha\EngineClient\Api;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * The Engine-stored environment variables of a container project.
 * The Engine keeps a KEY=>value map and
 * lists it with values masked; `reveal=1` returns them for the panel's env
 * editor. Only container (DinD) projects have them.
 */
final class EnvVarsApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * The stored variables and the keys the last deploy applied.
     * `GET env-vars?reveal=1` answers `{data:{vars:[{key,value,masked}],applied_keys:[…]}}`
     * (`EnvVarsController::index:49`, `EnvVarsResource`); a PHP-hosting project
     * answers 422 `env_vars_dind_only`.
     *
     * @return array<string, mixed>
     */
    public function show(EngineProject $project): array
    {
        return Payload::object($this->engine->get($project->enginePath('env-vars'), ['reveal' => 1])->json('data'));
    }

    /**
     * Replace the stored map with `$envVars` and either store it for the next
     * deploy (`apply: none`, 200) or recreate the changed services now
     * (`apply: recreate`, 202 + Task) – `EnvVarsController::update:122`.
     *
     * @param  array<string, string>  $envVars
     */
    public function update(EngineProject $project, array $envVars, bool $recreate): Response
    {
        // Applying the variables now restarts services, which the Engine
        // refuses on a protected project (EnsureProjectNotProtected.php:51/137);
        // storing them for the next deploy (`apply: none`) passes.
        if ($recreate) {
            ProjectProtectedException::throwIfProtected($project);
        }

        return $this->engine->put($project->enginePath('env-vars'), [
            'env_vars' => $envVars,
            'replace' => true,
            'apply' => $recreate ? 'recreate' : 'none',
        ]);
    }
}
