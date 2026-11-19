<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Static SPA files are served with gzip and with a long `immutable` cache, but
 * only for file names that carry a content hash. index.html, index-seo.html
 * and the translations under /locales/ have no hash and
 * must be revalidated on every visit, or users keep old code or old
 * translations after a panel update. /api, /mcp and /ws are not touched.
 *
 * The PHP test image has no nginx, so this class pins the wiring and checks
 * the hashed-file regex against real file names (nginx uses PCRE, like
 * preg_match).
 *
 * @see src/config/nginx.conf
 */
final class StaticAssetCacheTest extends TestCase
{
    private function nginx(): string
    {
        return (string) file_get_contents(base_path('../config/nginx.conf'));
    }

    /** The `location / { ... }` block of the front server, up to `location /api`. */
    private function spaLocation(): string
    {
        $nginx = $this->nginx();
        $start = strpos($nginx, 'location / {');
        $end = strpos($nginx, 'location /api {');
        $this->assertNotFalse($start);
        $this->assertNotFalse($end);

        return substr($nginx, (int) $start, (int) $end - (int) $start);
    }

    private function hashedPattern(): string
    {
        $this->assertSame(1, preg_match('/location ~ "([^"]+)" \{/', $this->spaLocation(), $m));

        return '#'.$m[1].'#';
    }

    public function test_hashed_files_get_a_long_immutable_cache_and_never_fall_back_to_index_html(): void
    {
        $spa = $this->spaLocation();

        $this->assertSame(1, substr_count($spa, 'add_header Cache-Control "public, max-age=31536000, immutable";'));
        // Without =404 a missing hashed file would be answered by index.html
        // through the SPA fallback, and that answer would be cached for a year.
        $this->assertStringContainsString('try_files $uri =404;', $spa);
    }

    public function test_the_hashed_pattern_matches_only_names_with_a_content_hash(): void
    {
        $pattern = $this->hashedPattern();

        $hashed = [
            '/js/chunk-vendors.a4779943.js',
            '/js/app.7c74e511.js',
            '/css/app.35bbb0e3.css',
            '/fonts/materialdesignicons-webfont.1d7bcee1.woff2',
            '/img/logo.0a1b2c3d.svg',
            '/assets/AcceptInviteView-fYXvAhej.js',
            '/assets/AdvancedPageLayout-BMSCX7-_.js',
        ];
        foreach ($hashed as $path) {
            $this->assertSame(1, preg_match($pattern, $path), "$path should be cached as immutable");
        }

        $unhashed = [
            '/',
            '/index.html',
            '/index-seo.html',
            '/dashboard',
            '/locales/en/translation.json',
            '/tinymce/tinymce.min.js',
            '/tinymce/skins/ui/oxide/skin.min.css',
            '/favicon.ico',
            '/assets/img/flags/AD.png',
            '/js/chunk-vendors.js',
            '/js/app.a4779943.js.map',
            '/js/sub/app.a4779943.js',
            '/assets/sub/View-fYXvAhej.js',
            '/api/admin/home',
        ];
        foreach ($unhashed as $path) {
            $this->assertSame(0, preg_match($pattern, $path), "$path must not be cached as immutable");
        }
    }

    public function test_index_html_and_translations_are_revalidated(): void
    {
        $nginx = $this->nginx();

        $this->assertStringContainsString('map $uri $panelalpha_spa_cache_control {', $nginx);
        $this->assertMatchesRegularExpression('#~\^/index\(-seo\)\?\\\\\.html\$\s+"no-cache";#', $nginx);
        $this->assertMatchesRegularExpression('#~\^/locales/\s+"no-cache";#', $nginx);
        $this->assertMatchesRegularExpression('#default\s+"";#', $nginx);
        $this->assertStringContainsString('add_header Cache-Control $panelalpha_spa_cache_control;', $this->spaLocation());
    }

    public function test_gzip_settings_and_cache_headers_stay_in_the_spa_location(): void
    {
        $nginx = $this->nginx();
        $spa = $this->spaLocation();

        $this->assertSame(1, substr_count($nginx, 'gzip_types '));
        $this->assertStringContainsString('gzip_types ', $spa);
        $this->assertStringContainsString('gzip_vary on;', $spa);

        // /api, /mcp and /ws keep their own caching and compression.
        $rest = substr($nginx, (int) strpos($nginx, 'location /api {'));
        $this->assertStringNotContainsString('Cache-Control', $rest);
        $this->assertStringNotContainsString('gzip_', $rest);
    }
}
