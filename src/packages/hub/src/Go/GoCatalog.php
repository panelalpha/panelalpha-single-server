<?php

namespace PanelAlpha\Hub\Go;

use Closure;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * PanelAlpha Go's catalog API (`{go}/api/catalog/v1`, panelalpha-go
 * `docs/operating-go/catalog-api.md`): the verified apps and how to install
 * one, read with the Hub token (`GoToken`). Go is never fatal to the panel: a
 * failure is logged and thrown as `GoUnavailable`, and a token Go refuses is
 * dropped and asked for again once.
 *
 * Only the documented fields cross to the browser. The lists, the search and
 * the categories are kept for a few minutes (the catalog changes a few times a
 * day); one app is always read from Go, since its `install` is what the panel
 * deploys.
 */
final class GoCatalog
{
    private const int TIMEOUT = 10;

    /** How long a list page, a search or the categories are kept. */
    public const int LIST_CACHE_SECONDS = 300;

    private const array APP_FIELDS = [
        'slug', 'name', 'tagline', 'categories', 'repository', 'page_url', 'icon_url', 'cover_url', 'verified',
        'tried_30_days', 'ready_image', 'stars', 'stars_updated_at', 'replaces',
    ];

    private const array DETAIL_FIELDS = ['headline', 'description', 'highlights', 'screenshots', 'install', 'release'];

    /** The orders `/apps` knows (`sort=`); without one, the site's order. */
    public const array SORTS = ['tried', 'name', 'verified', 'stars'];

    public function __construct(private readonly GoToken $token) {}

    /**
     * `GET /me`: the account, its plan and what the plan gives.
     *
     * @return array<string, mixed>
     */
    public function me(): array
    {
        $data = self::object($this->get('me')['data'] ?? null);

        return self::only($data, ['account', 'plan', 'token_expires_at', 'entitlements']);
    }

    /**
     * `GET /apps`: one page of the published apps, ranked like `/search` when
     * `q` is given, in the order `sort` names (one of `SORTS`) when given.
     *
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function apps(?string $q = null, ?string $category = null, int $page = 1, int $perPage = 24, ?string $sort = null): array
    {
        $query = array_filter([
            'q' => $q,
            'category' => $category,
            'sort' => in_array($sort, self::SORTS, true) ? $sort : null,
            'page' => max(1, $page),
            'per_page' => min(100, max(1, $perPage)),
        ], fn ($value) => $value !== null && $value !== '');

        return $this->remember('apps', $query, fn (): array => $this->list($this->get('apps', $query)));
    }

    /**
     * `GET /search`: the best `limit` apps for `q` (a search box).
     *
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function search(string $q, ?string $category = null, int $limit = 10): array
    {
        $query = array_filter([
            'q' => $q,
            'category' => $category,
            'limit' => min(50, max(1, $limit)),
        ], fn ($value) => $value !== null && $value !== '');

        return $this->remember('search', $query, fn (): array => $this->list($this->get('search', $query)));
    }

    /**
     * `GET /categories`: every category and how many apps it has, the largest first.
     *
     * @return list<array{name: string, apps: int}>
     */
    public function categories(): array
    {
        return $this->remember('categories', [], function (): array {
            $categories = [];
            foreach (self::objects($this->get('categories')['data'] ?? null) as $row) {
                if (isset($row['name']) && is_string($row['name'])) {
                    $categories[] = ['name' => $row['name'], 'apps' => isset($row['apps']) && is_int($row['apps']) ? $row['apps'] : 0];
                }
            }

            return $categories;
        });
    }

    /**
     * `GET /apps/{slug}`: one published app with its details and `install`.
     *
     * @return array<string, mixed>
     *
     * @throws GoUnavailable status 404 when Go has no such published app
     */
    public function app(string $slug): array
    {
        $data = self::object($this->get('apps/'.rawurlencode($slug))['data'] ?? null);
        if ($data === []) {
            throw new GoUnavailable('PanelAlpha Go answered no app.', 502);
        }

        return self::only($data, [...self::APP_FIELDS, ...self::DETAIL_FIELDS]);
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    private function get(string $path, array $query = []): array
    {
        $response = $this->send($path, $query);
        if ($response->status() === 401) {
            // An expired or rotated key: one more try with a fresh Hub token.
            $this->token->forget();
            $response = $this->send($path, $query);
        }

        if (! $response->successful()) {
            Log::warning('PanelAlpha Go catalog answered an error.', ['path' => $path, 'status' => $response->status()]);

            throw new GoUnavailable(match ($response->status()) {
                404 => 'PanelAlpha Go has no such app.',
                429 => 'Too many requests to PanelAlpha Go. Try again in a minute.',
                503 => 'The PanelAlpha Go catalog is not available yet.',
                default => 'The PanelAlpha Go catalog is unavailable.',
            }, $response->status());
        }

        return self::object($response->json());
    }

    /**
     * @param  array<string, mixed>  $query
     */
    private function send(string $path, array $query): Response
    {
        $token = $this->token->get();

        try {
            return Http::timeout(self::TIMEOUT)
                ->withoutRedirecting()
                ->acceptJson()
                ->withToken($token)
                ->get($this->url($path), $query);
        } catch (Throwable $e) {
            Log::warning('PanelAlpha Go catalog could not be reached.', ['path' => $path, 'error' => $e->getMessage()]);

            throw new GoUnavailable('The PanelAlpha Go catalog is unavailable.', previous: $e);
        }
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    private function list(array $body): array
    {
        $apps = [];
        foreach (self::objects($body['data'] ?? null) as $app) {
            $apps[] = self::only($app, self::APP_FIELDS);
        }

        return ['data' => $apps, 'meta' => self::object($body['meta'] ?? null)];
    }

    /**
     * @template T
     *
     * @param  array<string, mixed>  $query
     * @param  Closure(): T  $fetch
     * @return T
     */
    private function remember(string $kind, array $query, Closure $fetch): mixed
    {
        ksort($query);
        $key = 'hub:go-catalog:'.$kind.':'.hash('sha256', $this->baseUrl().'|'.http_build_query($query));

        /** @var T */
        return Cache::remember($key, self::LIST_CACHE_SECONDS, $fetch);
    }

    /**
     * The documented fields only: nothing else Go adds reaches the browser.
     *
     * @param  array<string, mixed>  $data
     * @param  list<string>  $fields
     * @return array<string, mixed>
     */
    private static function only(array $data, array $fields): array
    {
        return array_intersect_key($data, array_flip($fields));
    }

    /**
     * A JSON object, `[]` for anything else (the client-area `Payload::object()`,
     * which this package cannot require).
     *
     * @return array<string, mixed>
     */
    private static function object(mixed $value): array
    {
        $array = is_array($value) ? $value : [];
        $keys = array_map(static fn (mixed $key): string => (string) $key, array_keys($array));

        return array_combine($keys, array_values($array));
    }

    /**
     * A JSON list of objects; anything that is not an object is dropped.
     *
     * @return list<array<string, mixed>>
     */
    private static function objects(mixed $value): array
    {
        $array = is_array($value) ? $value : [];

        $objects = [];
        foreach (array_keys($array) as $key) {
            if (is_array($array[$key])) {
                $objects[] = self::object($array[$key]);
            }
        }

        return $objects;
    }

    private function baseUrl(): string
    {
        return rtrim(config()->string('hub.go_url'), '/');
    }

    private function url(string $path): string
    {
        return $this->baseUrl().'/api/catalog/v1/'.$path;
    }
}
