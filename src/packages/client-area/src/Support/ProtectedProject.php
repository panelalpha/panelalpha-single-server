<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\EngineProject;

/**
 * The Client Area's answer to the Engine's `protected` project setting. While
 * an operator keeps it on (`pae project:settings:set protected on`), the Engine
 * refuses every API-token call that would delete, stop or redeploy the project
 * with a 409 `{message, code: project_protected}` (Engine:
 * core/app/Http/Middleware/EnsureProjectNotProtected.php:157). The Engine
 * client refuses those operations before the call from the mirrored project
 * resource's `protected` flag (Engine: core/app/Http/Resources/UserResource.php:34)
 * and turns a 409 that slips past a stale mirror into the same
 * `ProjectProtectedException`; `EngineErrors` renders it with this answer.
 *
 * The CA shows the old-style 422 `{message, errors}` as a message; the
 * Engine's own text names the operator command, which the customer must not
 * read.
 */
final class ProtectedProject
{
    /** The user-safe Client Area message. */
    public const string REFUSAL = 'The server operator has protected this project, so it cannot be deleted, stopped or redeployed from the panel.';

    /**
     * Refuse a panel operation on a protected project before its first Engine
     * write (the primary-domain switch, the archive upload).
     *
     * @throws ValidationException
     */
    public static function refuse(EngineProject $project): void
    {
        if ($project->protected) {
            throw self::refusal();
        }
    }

    public static function refusal(): ValidationException
    {
        return ValidationException::withMessages([self::REFUSAL]);
    }
}
