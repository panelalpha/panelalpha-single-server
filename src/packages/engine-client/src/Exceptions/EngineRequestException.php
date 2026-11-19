<?php

namespace PanelAlpha\EngineClient\Exceptions;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * The Engine answered with an error other than 422 (those become
 * EngineValidationException) and other than a protected-project refusal
 * (ProjectProtectedException).
 *
 * Facts only: the Engine status, the Engine's `code`, the
 * Engine's own message (`engineMessage`, unredacted; null when the exception
 * did not come from an Engine answer or the answer had none) and `problems[]`,
 * plus the response. `getMessage()` is the Engine's message, or a neutral text
 * when it sent none. What a user is shown (pass-through statuses, redaction of
 * Engine internals) is the caller's presentation; the Client Area's lives in
 * `Support\EngineErrors`.
 */
class EngineRequestException extends EngineException
{
    /**
     * @param  list<array<string, mixed>>  $problems
     */
    public function __construct(
        public readonly int $engineStatus,
        string $message,
        public readonly ?Response $response = null,
        public readonly ?string $engineCode = null,
        public readonly array $problems = [],
        public readonly ?string $engineMessage = null,
    ) {
        parent::__construct($message);
    }

    public static function fromResponse(Response $response): self
    {
        $engineMessage = Payload::nullableString($response->json('message'));

        return new self(
            $response->status(),
            $engineMessage === null || $engineMessage === ''
                ? 'Engine API request failed with HTTP '.$response->status().'.'
                : $engineMessage,
            $response,
            Payload::nullableString($response->json('code')),
            Payload::objects($response->json('problems')),
            $engineMessage,
        );
    }
}
