<?php

namespace PanelAlpha\EngineClient\Exceptions;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Support\Payload;
use RuntimeException;

/**
 * The Engine's `protected` project setting refuses the operation.
 * While an operator keeps it on (`pae project:settings:set protected on`), the
 * Engine refuses every API-token call that would delete, stop or redeploy the
 * project with a 409 `{message, code: project_protected}` (Engine:
 * core/app/Http/Middleware/EnsureProjectNotProtected.php:157). The `Api`
 * methods of those operations refuse it before the call from the project's
 * `protected` flag, and a 409 that slips past a stale flag is
 * the same refusal.
 *
 * Facts only: the Engine status and `code` (null for the
 * pre-check, which never reached the Engine), the message and the project's
 * username. It is not an EngineException, so a `catch (EngineException)` does
 * not take it for a failed call; the Client Area answers it with its old-style
 * 422 (`Support\EngineErrors`).
 */
final class ProjectProtectedException extends RuntimeException
{
    /** The Engine refusal code (EnsureProjectNotProtected.php:25). */
    public const string CODE = 'project_protected';

    public function __construct(
        string $message,
        public readonly ?string $username = null,
        public readonly ?int $engineStatus = null,
        public readonly ?string $engineCode = null,
        public readonly ?Response $response = null,
    ) {
        parent::__construct($message);
    }

    /**
     * Refuse an operation on a protected project before it reaches the Engine.
     *
     * @throws self
     */
    public static function throwIfProtected(EngineProject $project): void
    {
        if ($project->protected) {
            throw new self("Project {$project->username} is protected.", $project->username);
        }
    }

    /**
     * Whether an Engine error answer is the protected-project refusal: a 409
     * whose body `code` is `project_protected`. Every other 409 stays an
     * EngineRequestException.
     */
    public static function isRefusal(Response $response): bool
    {
        return $response->status() === 409
            && Payload::nullableString($response->json('code')) === self::CODE;
    }

    public static function fromResponse(Response $response): self
    {
        $message = Payload::nullableString($response->json('message'));

        return new self(
            $message === null || $message === '' ? 'The project is protected.' : $message,
            engineStatus: $response->status(),
            engineCode: self::CODE,
            response: $response,
        );
    }
}
