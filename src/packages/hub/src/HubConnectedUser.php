<?php

namespace PanelAlpha\Hub;

/**
 * The Hub user who connected the panel: `user` in the approved
 * connect-request poll answer (PANEL-LOGIN-CONTRACT.md 1.4, Hub e909f456,
 * 2026-11-06). The same person a login ticket for them names: `id` is the
 * ticket's `sub`, `email` its `email`.
 *
 * Kept in memory only: the answer it comes from holds `server_secret`.
 */
final class HubConnectedUser
{
    private function __construct(
        public readonly ?int $id,
        public readonly string $email,
        public readonly string $name,
    ) {}

    /**
     * Null when the answer has no `user` (an older Hub, or `user: null` for an
     * impersonated Hub session or a deleted Hub account) or no valid email.
     *
     * @param  array<string, mixed>  $answer  the approved poll answer
     */
    public static function fromAnswer(array $answer): ?self
    {
        $user = $answer['user'] ?? null;
        if (! is_array($user)) {
            return null;
        }
        $email = self::text($user['email'] ?? null);
        $email = strtolower($email);
        if ($email === '' || strlen($email) > 255 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            return null;
        }
        $name = self::text($user['name'] ?? null);
        $id = isset($user['id']) && is_int($user['id']) ? $user['id'] : null;

        return new self(
            $id,
            $email,
            // The brief: an empty name becomes the part before the @.
            $name !== '' ? $name : explode('@', $email)[0],
        );
    }

    private static function text(mixed $value): string
    {
        return is_string($value) ? trim($value) : '';
    }
}
