<?php

namespace PanelAlpha\EngineClient\Exceptions;

use PanelAlpha\EngineClient\EngineConnection;
use Throwable;

/**
 * The Engine could not be reached (DNS, TCP, TLS, timeout).
 */
class EngineUnavailableException extends EngineException
{
    /**
     * @param  bool  $transport  the Engine did not answer at all, so the message
     *                           names its address and the transport error
     */
    public function __construct(
        string $message = '',
        int $code = 0,
        ?Throwable $previous = null,
        public readonly bool $transport = false,
    ) {
        parent::__construct($message, $code, $previous);
    }

    public static function from(EngineConnection $connection, Throwable $previous): self
    {
        return new self("Engine #{$connection->id} is unreachable: {$previous->getMessage()}", previous: $previous, transport: true);
    }

    /**
     * An Engine answer that means "busy, retry" rather than "bad request": the
     * task-log stream's 503 with `Retry-After`. Exposed so a caller
     * can treat it as the Engine being down.
     */
    public static function fromStatus(int $status, ?Throwable $previous = null): self
    {
        return new self("The Engine answered HTTP {$status}.", previous: $previous);
    }
}
