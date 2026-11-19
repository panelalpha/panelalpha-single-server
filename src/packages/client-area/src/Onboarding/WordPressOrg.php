<?php

namespace PanelAlpha\ClientArea\Onboarding;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Support\Payload;
use RuntimeException;

/**
 * The slice of the WordPress.org API the onboarding form needs (GET
 * /projects/wordpress-versions). A fixed host, so no HostGuard – the
 * route is rate-limited and the call times out.
 *
 * Ported from the old `App\Lib\Apis\WordpressOrg::availableVersions()`: the
 * version-check offers, newest first, without anything below 4.0 (too old for
 * wp-cli) and without duplicates.
 *
 * Permanent panel code: the Engine does not need to serve this (checked
 * 2026-10-14; wordpress.org is a fixed public catalog, not Engine data), so the
 * port moved from client-area-legacy (old-api …/WordpressOrg.php) into the
 * controller.
 */
final class WordPressOrg
{
    private const VERSION_CHECK_URL = 'https://api.wordpress.org/core/version-check/1.7/';

    private const THEMES_URL = 'https://api.wordpress.org/themes/info/1.2/';

    /**
     * The onboarding theme browser (GET /projects/onboarding
     * /themes), ported from the old `WordpressOrg::themes()`: the raw
     * `{themes, info}` the CA splits into `data` and `meta`.
     *
     * @return array{themes: list<array<string, mixed>>, info: array<string, mixed>}
     */
    public function themes(string $search = '', int $perPage = 12, int $page = 1, string $browse = '', string $tag = ''): array
    {
        $request = array_filter([
            'search' => $search,
            'per_page' => $perPage,
            'page' => $page,
            'browse' => $browse,
            'tag' => $tag,
        ], static fn ($value): bool => $value !== '' && $value !== 0);

        try {
            $response = Http::acceptJson()
                ->timeout(10)
                ->get(self::THEMES_URL, ['action' => 'query_themes', 'request' => $request]);
        } catch (ConnectionException $e) {
            report($e);

            return ['themes' => [], 'info' => []];
        }

        if (! $response->successful()) {
            report(new RuntimeException('The WordPress.org theme query answered HTTP '.$response->status().'.'));

            return ['themes' => [], 'info' => []];
        }

        return [
            'themes' => Payload::objects($response->json('themes', [])),
            'info' => Payload::object($response->json('info', [])),
        ];
    }

    /**
     * @return list<string>
     */
    public function availableVersions(): array
    {
        try {
            $response = Http::acceptJson()->timeout(10)->get(self::VERSION_CHECK_URL);
        } catch (ConnectionException $e) {
            report($e);

            return [];
        }

        if (! $response->successful()) {
            report(new RuntimeException('The WordPress.org version check answered HTTP '.$response->status().'.'));

            return [];
        }

        $versions = [];
        foreach (Payload::objects($response->json('offers', [])) as $offer) {
            $version = Payload::nullableString($offer['version'] ?? null);

            if ($version === null || $version === '' || version_compare($version, '4.0.0', '<')) {
                continue;
            }
            if (! in_array($version, $versions, true)) {
                $versions[] = $version;
            }
        }

        return $versions;
    }
}
