<?php

namespace PanelAlpha\Hub\Go;

use RuntimeException;
use Throwable;

/**
 * PanelAlpha Go's catalog (or the Hub token in front of it) did not answer as
 * expected. `status` is Go's HTTP status when it answered (404 = no such app,
 * 429 = too many requests, 503 = the API is off), 0 when it did not.
 */
final class GoUnavailable extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 0, ?Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }
}
