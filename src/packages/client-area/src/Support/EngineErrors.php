<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Foundation\Exceptions\Handler;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineNotConfiguredException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PanelAlpha\ClientArea\Hosting\HostGuard;
use PanelAlpha\ClientArea\Http\EngineRequestError;
use Throwable;
use WeakMap;

/**
 * How the Client Area presents an Engine failure. The Engine client's exceptions carry facts only – the Engine status,
 * `code`, message and `problems[]`; the CA texts, the redaction of Engine
 * internals and the HTTP answers live here:
 *
 * - not configured: 503 `{message}`; a transport failure (`transport`): 503
 *   with `EngineText::SAFE_UNAVAILABLE`, its own text (the Engine's address,
 *   port and path) staying in the log;
 * - an Engine 422: the old-style 422 `{message, errors}`, every field error
 *   that names Engine internals replaced by `EngineText::SAFE_VALIDATION`; an
 *   Engine refusal of an internal address (`problems[].code: host_refused`)
 *   is the panel's own `HostGuard` refusal;
 * - a protected project: the old-style 422 with `ProtectedProject::REFUSAL`;
 * - any other Engine error: `{message}` with the Engine's 404/409 passed
 *   through and 502 otherwise; a known `problems[].code` becomes the panel's
 *   own sentence, a message naming Engine internals is redacted, and a busy
 *   409 that names them reads `EngineText::SAFE_REFUSAL`.
 *
 * A known refusal (a pending project, a refused deploy key, a shared-zone
 * certificate, a PHP error) is first replaced by its one friendly sentence from
 * `EngineText::friendly()`, in 422 field errors, 422 problems and other
 * Engine errors alike; the leak check then covers the rest.
 *
 * Jobs and services that show an Engine failure to the CA (notifications,
 * stored errors, a `domain` field error) take the same text from `message()`.
 * A presented text is remembered per exception, so the redaction is logged once
 * however often it is read (render, report, a notification).
 */
final class EngineErrors
{
    /** The Engine's egress refusal code (`Lib/Net/EgressRefusedException::CODE`). */
    private const HOST_REFUSED = 'host_refused';

    /** @var WeakMap<EngineRequestException, string>|null */
    private static ?WeakMap $messages = null;

    /** @var WeakMap<EngineValidationException, array{exception: ValidationException, problems: list<array<string, mixed>>}>|null */
    private static ?WeakMap $validations = null;

    /**
     * Register the Client Area's answers with the exception handler. An Engine
     * 422 and a protected project are mapped onto Laravel's ValidationException,
     * so they render and stay unreported exactly like one; any other Engine
     * error is mapped onto `EngineRequestError`, which renders and reports it.
     */
    public static function register(Handler $handler): void
    {
        $handler->map(EngineValidationException::class, static fn (EngineValidationException $e): ValidationException => self::validation($e));
        $handler->map(ProjectProtectedException::class, static fn (ProjectProtectedException $e): ValidationException => ProtectedProject::refusal());
        $handler->map(EngineRequestException::class, static fn (EngineRequestException $e): EngineRequestError => new EngineRequestError($e));
        $handler->renderable(static fn (EngineNotConfiguredException $e): JsonResponse => self::render($e));
        $handler->renderable(static fn (EngineUnavailableException $e): JsonResponse => self::render($e));
    }

    /**
     * The text the Client Area shows for an Engine failure.
     */
    public static function message(Throwable $e): string
    {
        return match (true) {
            $e instanceof EngineUnavailableException => $e->transport ? EngineText::SAFE_UNAVAILABLE : $e->getMessage(),
            $e instanceof EngineRequestException => self::requestMessage($e),
            $e instanceof EngineValidationException => self::validation($e)->getMessage(),
            $e instanceof ProjectProtectedException => ProtectedProject::REFUSAL,
            default => $e->getMessage(),
        };
    }

    /**
     * The HTTP status the Client Area answers: the Engine's 404 (missing
     * project) and 409 (project busy) pass through, any other Engine error is
     * the Engine's fault (502), and an Engine that is not configured or not
     * reachable is 503.
     */
    public static function status(EngineException $e): int
    {
        if ($e instanceof EngineRequestException) {
            return in_array($e->engineStatus, [404, 409], true) ? $e->engineStatus : 502;
        }

        return 503;
    }

    public static function render(EngineException $e): JsonResponse
    {
        return response()->json(['message' => self::message($e)], self::status($e));
    }

    /**
     * An Engine 422 as the Client Area's validation error: the Engine's field
     * errors, a message that names an Engine path, task or absolute home path
     * replaced by a safe one and logged (the rule for other Engine messages,
     * extended to 422s).
     */
    public static function validation(EngineValidationException $e): ValidationException
    {
        return self::presentValidation($e)['exception'];
    }

    /**
     * The Engine's `problems[]` of a 422 as the Client Area may show them: a
     * `message` that names Engine internals is replaced like a field error.
     *
     * @return list<array<string, mixed>>
     */
    public static function problems(EngineValidationException $e): array
    {
        return self::presentValidation($e)['problems'];
    }

    /**
     * Field errors and problems are presented together, once per exception, so
     * every hidden text is logged exactly once.
     *
     * @return array{exception: ValidationException, problems: list<array<string, mixed>>}
     */
    private static function presentValidation(EngineValidationException $e): array
    {
        if (self::$validations === null) {
            /** @var WeakMap<EngineValidationException, array{exception: ValidationException, problems: list<array<string, mixed>>}> $validations */
            $validations = new WeakMap;
            self::$validations = $validations;
        }

        $known = self::$validations[$e] ?? null;
        if ($known !== null) {
            return $known;
        }

        // The Engine refused to fetch a user URL or host because it resolves to
        // an internal address (`RepositoryAddress::problem()`,
        // `EgressGuard::problem()`, `FileController::fetch`). Its text names the
        // address; the CA gets exactly what the panel's own guard answers for a
        // host it must not contact, whichever Engine call refused it.
        if (self::refusesHost($e->problems)) {
            return self::$validations[$e] = [
                'exception' => ValidationException::withMessages(['host' => [HostGuard::REFUSAL]]),
                'problems' => [['field' => 'host', 'code' => self::HOST_REFUSED, 'message' => HostGuard::REFUSAL]],
            ];
        }

        // The refusal's top-level `code` and its problems' codes pick a friendly
        // sentence first; the leak check handles the rest.
        $topCode = self::topCode($e);

        $sanitized = [];
        foreach (array_keys($e->errors) as $field) {
            $sanitized[$field] = self::presentValidationMessages($e->errors[$field], self::fieldCodes($e, (string) $field));
        }

        $exception = ValidationException::withMessages($sanitized);
        $problems = array_map(
            static function (array $problem) use ($topCode): array {
                if (isset($problem['message']) && is_string($problem['message'])) {
                    $problem['message'] = self::presentValidationText(
                        $problem['message'],
                        self::codes([$topCode, Payload::nullableString($problem['code'] ?? null)]),
                    );
                }

                return $problem;
            },
            $e->problems,
        );

        return self::$validations[$e] = ['exception' => $exception, 'problems' => $problems];
    }

    /**
     * @param  list<array<string, mixed>>  $problems
     */
    private static function refusesHost(array $problems): bool
    {
        foreach ($problems as $problem) {
            if (($problem['code'] ?? null) === self::HOST_REFUSED) {
                return true;
            }
        }

        return false;
    }

    /**
     * The Engine's own refusal texts (`DeployBusyException`,
     * `ProjectBusyException`) name Engine paths, task ids, internal
     * instructions ("Follow it with GET /tasks/48") and absolute home paths
     * (`/home/<u>/…`) that the customer must not see. A message the panel built itself
     * (no Engine message) is shown as it is.
     */
    private static function requestMessage(EngineRequestException $e): string
    {
        if (self::$messages === null) {
            /** @var WeakMap<EngineRequestException, string> $messages */
            $messages = new WeakMap;
            self::$messages = $messages;
        }

        $known = self::$messages[$e] ?? null;
        if ($known !== null) {
            return $known;
        }

        return self::$messages[$e] = self::presentRequestMessage($e);
    }

    private static function presentRequestMessage(EngineRequestException $e): string
    {
        $message = $e->engineMessage;
        if ($message === null || $message === '') {
            return $e->getMessage();
        }

        // A known `problems[].code` gets our own user-safe sentence: the
        // Engine's own text for it instructs the API caller ("Create the
        // project with `template: dind`"), which the CA must not show.
        $mapped = EngineText::problemMessage($e->problems);
        if ($mapped !== null) {
            return $mapped;
        }

        // A known refusal (a pending project, a refused deploy key, a PHP
        // error) reads as one friendly sentence; the original is logged.
        $codes = [$e->engineCode];
        foreach ($e->problems as $problem) {
            $codes[] = Payload::nullableString($problem['code'] ?? null);
        }
        $friendly = EngineText::friendly($message, self::codes($codes));
        if ($friendly !== null) {
            Log::warning('Engine text hidden from the Client Area.', ['message' => $message]);

            return $friendly;
        }

        if (EngineText::leaksInternals($message)) {
            // Keep the real refusal in the log; the CA gets the same reason
            // with only the Engine internals redacted. A
            // 409 keeps the CA's own busy text, which names nothing internal.
            $redacted = EngineText::sanitize($message);

            return $e->engineStatus === 409 ? EngineText::SAFE_REFUSAL : $redacted;
        }

        return $message;
    }

    /**
     * The Engine's top-level `code` of a 422. The Engine renders it beside
     * `errors` and `problems`, and the exception keeps only the response.
     */
    private static function topCode(EngineValidationException $e): ?string
    {
        $code = Payload::nullableString($e->response?->json('code'));

        return $code !== null && $code !== '' ? $code : null;
    }

    /**
     * The codes that apply to one field error: the codes of the problems on
     * that field, plus the refusal's top-level code. The synthetic `engine`
     * field (an answer without field errors) takes every problem's code.
     *
     * @return list<string>
     */
    private static function fieldCodes(EngineValidationException $e, string $field): array
    {
        $codes = [self::topCode($e)];
        foreach ($e->problems as $problem) {
            $problemField = Payload::nullableString($problem['field'] ?? null);
            if ($field === 'engine' || $problemField === $field) {
                $codes[] = Payload::nullableString($problem['code'] ?? null);
            }
        }

        return self::codes($codes);
    }

    /**
     * @param  list<?string>  $values
     * @return list<string>
     */
    private static function codes(array $values): array
    {
        $codes = [];
        foreach ($values as $value) {
            if ($value !== null && $value !== '') {
                $codes[] = $value;
            }
        }

        return $codes;
    }

    /**
     * @param  list<mixed>  $messages
     * @param  list<string>  $codes
     * @return list<mixed>
     */
    private static function presentValidationMessages(array $messages, array $codes): array
    {
        return array_map(
            static fn (mixed $value): mixed => is_string($value) ? self::presentValidationText($value, $codes) : $value,
            $messages,
        );
    }

    /**
     * A friendly sentence for a known refusal, logged with the original;
     * otherwise the leak check.
     *
     * @param  list<string>  $codes
     */
    private static function presentValidationText(string $message, array $codes): string
    {
        $friendly = EngineText::friendly($message, $codes);
        if ($friendly !== null) {
            Log::warning('Engine validation text hidden from the Client Area.', ['message' => $message]);

            return $friendly;
        }

        return self::sanitizeValidation($message);
    }

    private static function sanitizeValidation(string $message): string
    {
        if (! EngineText::leaksInternals($message)) {
            return $message;
        }

        Log::warning('Engine validation text hidden from the Client Area.', ['message' => $message]);

        return EngineText::SAFE_VALIDATION;
    }
}
