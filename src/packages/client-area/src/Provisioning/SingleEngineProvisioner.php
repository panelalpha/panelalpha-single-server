<?php

namespace PanelAlpha\ClientArea\Provisioning;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Carbon;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Contracts\EngineResolver;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Community: create the project on the one Engine (async POST /projects → 202 +
 * Task; the typed body on an Engine that takes it, ProjectsApi::create())
 * and record a 'pending' local row right away, so the CA can show the project
 * while the Engine builds it. The next sync fills in the rest.
 *
 * There is no ownership to record in Community – $owner is unused. The row
 * records that the panel asked for the project (`panel_created_at`).
 */
final class SingleEngineProvisioner implements ApplicationProvisioner
{
    public function __construct(private readonly EngineResolver $engines) {}

    public function provision(Authenticatable $owner, ProvisionRequest $request): ProvisionResult
    {
        $response = (new ProjectsApi($this->engines->forEngine(EngineConnection::DEFAULT_ID)))
            ->create($request->toEnginePayload());

        $task = (array) $response->json('data');
        $username = $task['username'] ?? $request->username;
        if (! is_string($username) || $username === '') {
            throw new EngineRequestException($response->status(), 'The Engine did not return the new project username.', $response);
        }

        // The Engine allocates the main domain inside the create task and
        // returns it in `details.domain` (ProjectCreator::queue); a files-source
        // onboarding has no requested domain, and the CA's lost-response
        // recovery matches the new row by domain.
        $details = Payload::object($task['details'] ?? null);
        $domain = $request->domain;
        if ($domain === null) {
            $allocated = Payload::nullableString($details['domain'] ?? null);
            if ($allocated !== null && $allocated !== '') {
                $domain = $allocated;
            }
        }

        // The panel knows the kind it asked for, so
        // the created row carries `type = custom` at once (a classic or container
        // project is custom until the WordPress probe refines it). Without it
        // every kind-gated action (rename, staging, copy, push) is refused until
        // the hourly probe runs (up to an hour).
        // The panel asked for this project, so panel-wide defaults (the
        // automatic-backup schedule) apply to it, unlike a mirrored one.
        $application = Application::query()->firstOrCreate(
            ['engine_id' => EngineConnection::DEFAULT_ID, 'engine_username' => $username],
            ['domain' => $domain, 'status' => 'pending', 'engine_created_at' => Carbon::now(), 'panel_created_at' => Carbon::now(), 'type' => Application::TYPE_CUSTOM],
        );

        return new ProvisionResult($application, Payload::int($task['id'] ?? null));
    }
}
