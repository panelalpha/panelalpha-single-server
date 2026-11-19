<?php

namespace PanelAlpha\EngineClient\Exceptions;

use Illuminate\Http\Client\Response;
use PanelAlpha\EngineClient\Support\Payload;
use RuntimeException;

/**
 * Engine 422: the Engine rejected the request's input.
 *
 * Facts only: the Engine's message, its field errors
 * (`errors`, each field a list; an answer without field errors keeps the
 * message under `engine`) and its structured `problems[]`
 * ({field, code, message, stage?, deploy_log_offset?}), all as the Engine sent
 * them. It is not a Laravel ValidationException and renders nothing: the
 * Client Area turns it into its old-style 422 `{message, errors}`
 * (`Support\EngineErrors`).
 */
class EngineValidationException extends RuntimeException
{
    /**
     * @param  array<string, list<mixed>>  $errors
     * @param  list<array<string, mixed>>  $problems
     */
    public function __construct(
        string $message,
        public readonly array $errors,
        public readonly array $problems = [],
        public readonly ?Response $response = null,
    ) {
        parent::__construct($message);
    }

    public static function fromResponse(Response $response): self
    {
        $message = Payload::string($response->json('message')) ?: 'The Engine rejected the request.';

        $errors = Payload::object($response->json('errors'));
        if ($errors === []) {
            $errors = ['engine' => [$message]];
        }

        $fields = [];
        foreach (array_keys($errors) as $field) {
            $fields[$field] = is_array($errors[$field]) ? array_values($errors[$field]) : [$errors[$field]];
        }

        return new self($message, $fields, Payload::objects($response->json('problems')), $response);
    }

    /**
     * The same refusal with every field (the `errors` keys and each problem's
     * `field`) renamed, e.g. a typed create's `domain.name` back to the flat
     * `domain` the caller handles. Messages and codes stay.
     *
     * @param  callable(string): string  $rename
     */
    public function withFieldsRenamed(callable $rename): self
    {
        $errors = [];
        foreach (array_keys($this->errors) as $field) {
            $flat = $rename((string) $field);
            $errors[$flat] = array_merge($errors[$flat] ?? [], $this->errors[$field]);
        }

        $problems = array_map(static function (array $problem) use ($rename): array {
            $field = Payload::nullableString($problem['field'] ?? null);
            if ($field !== null) {
                $problem['field'] = $rename($field);
            }

            return $problem;
        }, $this->problems);

        return new self($this->getMessage(), $errors, $problems, $this->response);
    }
}
