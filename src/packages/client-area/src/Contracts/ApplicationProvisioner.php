<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Provisioning\ProvisionRequest;
use PanelAlpha\ClientArea\Provisioning\ProvisionResult;

/**
 * Question 4 of the edition contracts: "where does a new application go,
 * and who owns it?"
 *
 * Community: create on the one Engine. Pro: same, then link the owner.
 * Multi: pick an Engine (placement), create there, link the owner.
 *
 * Provisioning only starts the Engine work (POST /projects returns 202 + task).
 * Following the task and notifying users is the caller's job.
 */
interface ApplicationProvisioner
{
    public function provision(Authenticatable $owner, ProvisionRequest $request): ProvisionResult;
}
