<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Support\Facades\Log;

/**
 * The Engine's own refusal texts (`DeployBusyException`, `ProjectBusyException`,
 * validation messages) name Engine paths, task ids, internal instructions
 * ("Follow it with GET /tasks/48") and absolute server paths (`/home/<u>/…`,
 * `/var/lib/panelalpha/…`) that the customer must not see.
 *
 * Those fragments are replaced by neutral placeholders while the rest of the
 * Engine's reason survives: a permanent "permission denied"
 * must not be flattened into the transient "project is busy" text. The full
 * message is logged for operators.
 *
 * {@see friendly()} is the one table for the known refusals: a pending
 * project, a refused deploy key, a shared-zone certificate and a PHP error each
 * become one plain sentence. It is pure; the callers decide where to log.
 */
final class EngineText
{
    /** The Client-Area message when an Engine refusal is a busy 409. */
    public const string SAFE_REFUSAL = 'The project is busy with another operation. Please try again later.';

    /** The Client-Area field-error message when a 422 names Engine internals. */
    public const string SAFE_VALIDATION = 'The Engine rejected the request.';

    /**
     * The Client-Area message while a freshly created project's Engine create
     * task still runs: the Engine refuses the operation with a busy 409 or an
     * "Invalid action" 422, which does not tell the customer why.
     * Kept in both cases, with the status the Engine (or the old guard)
     * used.
     */
    public const string STILL_PREPARING = 'The project is still being prepared. Please try again in a moment.';

    /** SSH connect: the Engine refused the deploy key (`git_ssh_key_refused`). */
    public const string SSH_KEY_REFUSED = 'The repository did not accept the key. Check that you added it to this repository.';

    /** SSH connect: every other failure, so the customer sees one sentence. */
    public const string SSH_CONNECT_FAILED = 'Could not connect. Check the address and the key.';

    /** When the Engine does not answer at all; its own text, with its address, stays in the log. */
    public const string SAFE_UNAVAILABLE = 'The server did not answer in time. Please try again in a moment.';

    /** A certificate for a name under a shared zone (the Engine's `shared_zone_issuance` refusal). */
    public const string SHARED_ZONE_REFUSED = 'This name is under a shared zone; use your own domain or ask the server administrator.';

    /** A PHP error text from a failed Engine step. Read after "Installation of <name> failed.". */
    public const string INTERNAL_ERROR_DETAIL = 'The server ran into an internal error. Please try again later or contact support.';

    /** Placeholder for an absolute home or system path. */
    public const string REDACTED_PATH = '[path]';

    /** Placeholder for a task id (`/tasks/48`, `task 55`). */
    public const string REDACTED_TASK = '[task]';

    /** Placeholder for an Engine API path (`/api/…`, `api/projects/…`). */
    public const string REDACTED_ENDPOINT = '[engine endpoint]';

    /** Placeholder for an HTTP method plus URI (`GET /tasks/48`). */
    public const string REDACTED_REQUEST = '[engine request]';

    /**
     * Known Engine `problems[].code` values and the user-safe sentence the CA
     * gets instead of the Engine's own text. The Engine's refusals instruct the
     * API caller ("Create the project with `template: dind`"), which a customer
     * must never read.
     *
     * @var array<string, string>
     */
    private const PROBLEM_MESSAGES = [
        'project_not_eligible' => 'This project cannot be deployed from git. Create a new project instead.',
        'source_already_attached' => 'This project already deploys from a git repository.',
    ];

    /**
     * Engine `problems[].code` values whose refusal reads as one friendly
     * sentence. A known code decides the text even when the message does not
     * match a pattern below.
     *
     * @var array<string, string>
     */
    private const FRIENDLY_CODES = [
        'project_pending' => self::STILL_PREPARING,
        'target_pending' => self::STILL_PREPARING,
        'git_ssh_key_refused' => self::SSH_KEY_REFUSED,
    ];

    /**
     * A PHP error text: an undefined call, a stack trace, an uncaught throwable
     * or a PHP fatal or parse error line. A `PHP Warning:` is left out on purpose:
     * it does not stop the work, so it must not replace the real cause.
     */
    private const string PHP_ERROR = '/Call to (?:an )?undefined (?:method|function)|Call to a member function|Stack trace:|\bPHP (?:Fatal error|Parse error):|\bUncaught \S*(?:Exception|Error)\b/i';

    /**
     * The plugin or theme folder a path points at. A PHP error in the customer's
     * own code names it, and the customer can act on that name.
     */
    private const string CLIENT_CODE_PATH = '#wp-content/(mu-plugins|plugins|themes)/([A-Za-z0-9._-]+)#';

    /**
     * Engine message patterns, checked in order when no known code applies.
     * Each maps a refusal text to its friendly sentence.
     *
     * @var array<string, string>
     */
    private const FRIENDLY_PATTERNS = [
        '/^Project \'[^\']+\' is pending\.?$/' => self::STILL_PREPARING,
        '/Permission denied \(publickey/i' => self::SSH_KEY_REFUSED,
        '/shared_zone_issuance|a zone every engine in the fleet issues under/i' => self::SHARED_ZONE_REFUSED,
        self::PHP_ERROR => self::INTERNAL_ERROR_DETAIL,
    ];

    /**
     * The friendly sentence for a raw Engine or PHP refusal text, or null when
     * the text is not one of the known refusals (the caller keeps its own rules).
     * Pure: it logs nothing. Known codes are checked first, in the order given,
     * then the message patterns. No friendly sentence matches a pattern, so
     * applying this twice changes nothing.
     *
     * @param  list<string>  $codes  the Engine codes of the refusal (`problems[].code`, top-level `code`)
     */
    public static function friendly(string $message, array $codes = []): ?string
    {
        foreach ($codes as $code) {
            if (isset(self::FRIENDLY_CODES[$code])) {
                return self::FRIENDLY_CODES[$code];
            }
        }

        $trimmed = trim($message);

        // A PHP error from the customer's plugin or theme is theirs to fix: keep
        // the name of the plugin or theme and drop the rest. The name comes
        // only from the error line itself, never from a stack trace frame, where
        // a plugin is often just one caller of an Engine or WP-CLI error.
        if (preg_match(self::PHP_ERROR, $trimmed) === 1) {
            foreach (preg_split('/\R/', $trimmed) ?: [] as $line) {
                $line = trim($line);
                if (str_starts_with($line, '#') || str_starts_with($line, 'Stack trace:')) {
                    continue;
                }
                if (preg_match(self::PHP_ERROR, $line) === 1
                    && preg_match(self::CLIENT_CODE_PATH, $line, $found) === 1) {
                    return sprintf(
                        'The %s "%s" caused an error. Fix or remove it, then try again.',
                        $found[1] === 'themes' ? 'theme' : 'plugin',
                        $found[2],
                    );
                }
            }
        }

        foreach (self::FRIENDLY_PATTERNS as $pattern => $friendly) {
            if (preg_match($pattern, $trimmed) === 1) {
                return $friendly;
            }
        }

        return null;
    }

    /**
     * The text a notification or a stored import detail carries: the friendly
     * sentence for a known refusal (the original is logged once, as sanitize()
     * does for a hidden text), otherwise the sanitised Engine text.
     */
    public static function present(string $message): string
    {
        $friendly = self::friendly($message);
        if ($friendly === null) {
            return self::sanitize($message);
        }

        Log::warning('Engine text hidden from the Client Area.', ['message' => $message]);

        return $friendly;
    }

    /**
     * The user-safe message for a known Engine `problems[].code`, or null when
     * the refusal carries no code we recognise (the caller falls back to the
     * redaction rules). The Engine renders `problems` beside `errors`
     * (`core/app/Exceptions/Handler.php:186`).
     */
    public static function problemMessage(mixed $problems): ?string
    {
        foreach (Payload::objects($problems) as $problem) {
            $code = Payload::nullableString($problem['code'] ?? null);
            if ($code !== null && isset(self::PROBLEM_MESSAGES[$code])) {
                return self::PROBLEM_MESSAGES[$code];
            }
        }

        return null;
    }

    /**
     * An Engine path (`/api/…`, `api/projects/…`), an HTTP method with a URI
     * (`GET /tasks/48`), a task id (`task 55`), an absolute home path
     * (`/home/<u>/…`) or an absolute Engine/system path (`/var/lib/panelalpha/…`,
     * the archive stage) must stay out of the Client Area. A caller instruction
     * ("Create the project with `template: dind`") does too.
     */
    public static function leaksInternals(string $message): bool
    {
        return (bool) preg_match(
            '#(?:/api/|api/projects/|/tasks/\d+|\b(?:GET|POST|PUT|PATCH|DELETE)\s+/|\btask\s+\d+\b|/home/|(?:^|[\s"\'\[(])/(?:var|usr|opt|srv|etc|root|run|proc|sys)/|\btemplate:\s*dind\b|\bCreate the project with\b)#i',
            $message,
        );
    }

    /**
     * Redact the internal fragments of a message and log the full message for
     * operators. Idempotent: the placeholders name nothing internal. Used by the
     * deploy watcher, the notifier and the auto-deploy import, where the Engine's
     * message is stored or sent rather than thrown.
     */
    public static function sanitize(string $message): string
    {
        if (! self::leaksInternals($message)) {
            return $message;
        }

        Log::warning('Engine text hidden from the Client Area.', ['message' => $message]);

        return self::redact($message);
    }

    /**
     * Redact the internal fragments of a message without logging it. For reads
     * that repeat on a timer, such as the Community task list's poll, where
     * sanitize() would log the same message on every request.
     */
    public static function redact(string $message): string
    {
        if (! self::leaksInternals($message)) {
            return $message;
        }

        $redacted = $message;

        // A caller instruction ("Create the project with `template: dind` to
        // deploy it from git.") is a whole sentence, not a fragment: drop it so
        // the reason that precedes it survives.
        $redacted = (string) preg_replace('#\s*Create the project with[^.]*\.?#i', '', $redacted);
        // A bare `template: dind` that did not sit in that sentence.
        $redacted = (string) preg_replace('#\btemplate:\s*dind\b#i', '[project template]', $redacted);
        // "Follow it with GET /tasks/48".
        $redacted = (string) preg_replace('#\b(?:GET|POST|PUT|PATCH|DELETE)\s+/\S+#i', self::REDACTED_REQUEST, $redacted);
        // "/tasks/48" and "task 55".
        $redacted = (string) preg_replace('#/tasks/\d+#i', self::REDACTED_TASK, $redacted);
        $redacted = (string) preg_replace('#\btask\s+\d+\b#i', 'task '.self::REDACTED_TASK, $redacted);
        // Engine API paths: "/api/…" and "api/projects/…".
        $redacted = (string) preg_replace('#(?:/api/|api/projects/)\S*#i', self::REDACTED_ENDPOINT, $redacted);
        // Absolute home and system paths, up to the end of the path token. The
        // `^` branch catches a message that starts with the path; the lookbehind
        // still keeps a path inside a URL (e.g. `https://host/home/…`) intact.
        $redacted = (string) preg_replace(
            '#(?:^|(?<=[\s"\'\[(]))/(?:home|var|usr|opt|srv|etc|root|run|proc|sys)/[^\s"\',;:)\]]*#',
            self::REDACTED_PATH,
            $redacted,
        );

        return $redacted;
    }
}
