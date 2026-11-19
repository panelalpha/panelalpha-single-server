<?php

namespace PanelAlpha\ClientArea\Http;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\ClientArea\Support\EngineErrors;
use RuntimeException;

/**
 * An Engine error answer as the Client Area renders and reports it.
 * The exception handler maps every EngineRequestException onto this
 * (`EngineErrors::register()`), so the neutral exception keeps its facts and
 * the CA gets `{message}` with the Engine's 404/409 passed through and 502 for
 * anything else, the message presented by EngineErrors.
 */
final class EngineRequestError extends RuntimeException
{
    public function __construct(public readonly EngineRequestException $engine)
    {
        parent::__construct(EngineErrors::message($engine), previous: $engine);
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], EngineErrors::status($this->engine));
    }

    /**
     * An expected Engine 4xx (a business refusal) is logged at warning without
     * the throwable, so it does not fill the log with a stack trace; an Engine
     * 5xx stays a real error.
     */
    public function report(): bool
    {
        if ($this->engine->engineStatus >= 400 && $this->engine->engineStatus < 500) {
            Log::warning('Engine refused the request.', [
                'status' => $this->engine->engineStatus,
                'message' => $this->getMessage(),
            ]);

            return true;
        }

        return false;
    }
}
