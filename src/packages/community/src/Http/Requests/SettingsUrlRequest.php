<?php

namespace PanelAlpha\Community\Http\Requests;

use Closure;
use Illuminate\Foundation\Http\FormRequest;

/**
 * The panel's public URL: an absolute https origin, as the Engine serves the
 * panel over HTTPS only (`PA_PUBLIC_URL`). A path other than `/`, a query, a
 * fragment or credentials are refused, so what is stored is always
 * `https://host[:port]`.
 *
 * The sentences are the ones the Client Area's own rules show (`settings.validation.url`,
 * `.urlHttps`, `.port` in the translation bundle); a test keeps the two equal.
 */
class SettingsUrlRequest extends FormRequest
{
    public const string NOT_HTTPS = 'The panel is served over HTTPS only, so its address starts with https://.';

    public const string NOT_AN_ORIGIN = 'Enter an address such as https://panel.example.com, without a path, query or fragment.';

    public const string BAD_PORT = 'The port must be a number from 1 to 65535.';

    private const int HTTPS_PORT = 443;

    private const int MAX_PORT = 65535;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'url' => [
                'required',
                'string',
                'max:255',
                'url:http,https',
                static function (string $attribute, mixed $value, Closure $fail): void {
                    $port = is_string($value) ? self::writtenPort($value) : null;
                    $parts = is_string($value) ? self::parts($value) : null;
                    if ($port !== null && ($port < 1 || $port > self::MAX_PORT)) {
                        // `parse_url()` refuses such a port, so it would otherwise read as a path problem.
                        $fail(self::BAD_PORT);
                    } elseif ($parts === null) {
                        $fail(self::NOT_AN_ORIGIN);
                    } elseif ($parts['scheme'] !== 'https') {
                        $fail(self::NOT_HTTPS);
                    }
                },
            ],
        ];
    }

    /**
     * `scheme://host[:port]`, lowercase, without a trailing slash, of a URL
     * that passed `rules()`.
     */
    public static function originOf(string $url): string
    {
        $parts = self::parts($url);

        return $parts === null ? rtrim($url, '/') : $parts['origin'];
    }

    /**
     * The lowercase host of a URL that passed `rules()`.
     */
    public static function hostOf(string $url): string
    {
        $parts = self::parts($url);

        return $parts === null ? '' : $parts['host'];
    }

    /**
     * The port of a URL that passed `rules()`: 443 when it names none.
     */
    public static function portOf(string $url): int
    {
        return self::parts($url)['port'] ?? self::HTTPS_PORT;
    }

    /** The port of a value that is nothing but `scheme://host:port`, which `parse_url()` may refuse. */
    private static function writtenPort(string $url): ?int
    {
        return preg_match('#^[a-z][a-z0-9+.\-]*://[^/?\#]+:(\d+)$#i', trim($url), $matches) === 1 ? (int) $matches[1] : null;
    }

    /**
     * @return array{origin: string, scheme: string, host: string, port: int}|null  null when the URL is more than an origin
     */
    private static function parts(string $url): ?array
    {
        $parsed = parse_url($url);
        if ($parsed === false) {
            return null;
        }

        $scheme = strtolower($parsed['scheme'] ?? '');
        $host = strtolower($parsed['host'] ?? '');
        $path = $parsed['path'] ?? '';
        if (! in_array($scheme, ['http', 'https'], true) || $host === '' || ! in_array($path, ['', '/'], true)) {
            return null;
        }

        if (isset($parsed['query']) || isset($parsed['fragment']) || isset($parsed['user']) || isset($parsed['pass'])) {
            return null;
        }

        // `?` or `#` with nothing after them leave no key in parse_url().
        if (str_contains($url, '?') || str_contains($url, '#')) {
            return null;
        }

        // An explicit :443 is the default port, so the stored origin leaves it out, as the Engine's PA_PUBLIC_URL does.
        $port = $parsed['port'] ?? ($scheme === 'https' ? self::HTTPS_PORT : 80);
        $suffix = isset($parsed['port']) && ! ($scheme === 'https' && $port === self::HTTPS_PORT) ? ':'.$port : '';

        return ['origin' => $scheme.'://'.$host.$suffix, 'scheme' => $scheme, 'host' => $host, 'port' => $port];
    }
}
