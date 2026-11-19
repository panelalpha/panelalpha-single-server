<?php

namespace PanelAlpha\ClientArea\Contracts;

use PanelAlpha\ClientArea\Models\Application;

/**
 * Whether a project's diagnostic mode blocks the user's actions on it (old
 * `HealthCheck::validateEntity()`, packages/api/app/Lib/Helpers/HealthCheck.php:
 * 17-36): a hosting account or an instance in diagnostic mode refuses its
 * actions with a 422 "Managing the … is currently not possible (Diagnostic
 * Mode). Please contact support for more details.".
 *
 * Community has no diagnostic mode: the controller's default never refuses
 * ({@see \PanelAlpha\ClientArea\Support\NoDiagnosticMode}); the paid
 * Admin Area binds its `diagnostic_statuses` rows (`Health\DiagnosticModes`), so
 * the Client Area refuses where the old panel did again.
 */
interface DiagnosticMode
{
    /** The project's own instance is in diagnostic mode. */
    public const string INSTANCE = 'instance';

    /** The project's hosting account is in diagnostic mode (the instance inherits it). */
    public const string HOSTING_ACCOUNT = 'hosting_account';

    /**
     * The level whose diagnostic mode blocks actions on the project, or null
     * when the project is not in diagnostic mode.
     *
     * @return self::INSTANCE|self::HOSTING_ACCOUNT|null
     */
    public function blockedEntity(Application $application): ?string;
}
