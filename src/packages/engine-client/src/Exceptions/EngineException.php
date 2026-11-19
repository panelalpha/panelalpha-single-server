<?php

namespace PanelAlpha\EngineClient\Exceptions;

use RuntimeException;

/**
 * Base for a failure reaching an Engine: no credentials, unreachable, or an
 * error answer. It carries facts only and renders nothing; the caller decides
 * what its user sees (the Client Area: `Support\EngineErrors`).
 *
 * An Engine 422 (`EngineValidationException`) and a protected-project refusal
 * (`ProjectProtectedException`) are deliberately not of this type, so a
 * `catch (EngineException)` does not swallow them.
 */
abstract class EngineException extends RuntimeException {}
