<?php

namespace PanelAlpha\EngineClient\Events;

/**
 * An Engine API call that did not succeed: the Engine could not be reached
 * (`$status` null) or it answered a non-2xx status. Facts only, as the
 * exceptions: which Engine, which call, the status, whether the
 * transport timed out or never connected, and the message the caller's
 * exception carries. Dispatched by `EngineClient::send()`/`stream()` right
 * before the exception is thrown, so a listener (the paid edition's incident
 * log) learns of every failure without wrapping every caller. The MCP
 * pass-through (`proxy()`) is not the Engine API and dispatches nothing.
 */
final readonly class EngineCallFailed
{
    public function __construct(
        public int $engineId,
        public string $method,
        public string $path,
        public ?int $status,
        public bool $timedOut,
        public bool $connectFailure,
        public string $message,
    ) {}

    /** The Engine never answered: a connect failure, a timeout or a TLS error. */
    public function unreachable(): bool
    {
        return $this->status === null;
    }

    /**
     * The Engine project the call addressed (`projects/{username}/…` or the
     * legacy `users/{username}/…`), or null for an Engine-wide call.
     */
    public function projectUsername(): ?string
    {
        if (preg_match('#^(?:projects|users)/([^/?]+)#', ltrim($this->path, '/'), $matches) !== 1) {
            return null;
        }

        $username = rawurldecode($matches[1]);

        // Engine-wide routes under the same prefix (core/routes/api.php:128-129).
        return $username === '' || in_array($username, ['all', 'verify-new-username'], true) ? null : $username;
    }

    /** Whether the call addressed the project itself (`projects/{username}`), not one of its sub-resources. */
    public function addressesProjectItself(): bool
    {
        return $this->projectUsername() !== null
            && preg_match('#^(?:projects|users)/[^/?]+/?(?:\?.*)?$#', ltrim($this->path, '/')) === 1;
    }
}
