<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * A state-changing API request from another site is refused even when it
 * carries the session cookie and the CSRF token: Sanctum reads `Origin` /
 * `Referer` only to decide statefulness, it never refuses a foreign one
 * (§4.4). `Origin` wins over `Referer`, the panel's own hosts (the one the
 * browser used, its saved URL and the Sanctum stateful list) pass, and a
 * request with neither header is a script, not a browser.
 *
 * @see src/backend/app/Http/Middleware/RefuseForeignOrigin.php
 */
final class OriginCheckTest extends TestCase
{
    use RefreshDatabase;

    private const array LABEL = ['title' => 'origin-check', 'color' => '#112233'];

    private function user(): User
    {
        return User::factory()->create();
    }

    public function test_a_write_from_another_site_is_refused(): void
    {
        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        // CA reads: packages/client-area/src/apis/Api.js:85 (`message` when there are no field errors)
        $this->actingAs($this->user())
            ->withHeader('Origin', 'https://evil.example.com')
            ->postJson('/api/labels', self::LABEL)
            ->assertStatus(403)
            ->assertJsonPath('message', 'Origin mismatch.');

        $this->assertDatabaseCount('labels', 0);
    }

    public function test_a_foreign_origin_is_refused_even_when_the_referer_is_the_panels_own(): void
    {
        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($this->user())
            ->withHeaders([
                'Origin' => 'https://evil.example.com',
                'Referer' => 'http://localhost/',
            ])
            ->postJson('/api/labels', self::LABEL)
            ->assertStatus(403);

        $this->assertDatabaseCount('labels', 0);
    }

    public function test_a_foreign_referer_alone_is_refused(): void
    {
        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($this->user())
            ->withHeader('Referer', 'https://evil.example.com/page')
            ->postJson('/api/labels', self::LABEL)
            ->assertStatus(403);

        $this->assertDatabaseCount('labels', 0);
    }

    public function test_the_panels_own_origin_passes(): void
    {
        Setting::set('userapp.url', 'https://panel.example.test');

        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($this->user())
            ->withHeader('Origin', 'https://panel.example.test')
            ->postJson('/api/labels', self::LABEL)
            ->assertOk();

        $this->assertDatabaseCount('labels', 1);
    }

    public function test_the_host_the_browser_used_passes_behind_the_panels_own_domain(): void
    {
        // No stored URL and the default APP_URL: only the request's host names the panel.
        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($this->user())
            ->withHeader('Origin', 'https://panel.example.test')
            ->postJson('https://panel.example.test/api/labels', self::LABEL)
            ->assertOk();
    }

    public function test_a_stateful_dev_origin_passes(): void
    {
        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($this->user())
            ->withHeader('Origin', 'http://'.TestNetwork::LOOPBACK.':9080')
            ->postJson('/api/labels', self::LABEL)
            ->assertOk();
    }

    public function test_a_script_with_neither_header_passes(): void
    {
        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($this->user())
            ->postJson('/api/labels', self::LABEL)
            ->assertOk();
    }

    public function test_a_read_from_another_site_is_not_refused(): void
    {
        // CA: packages/client-area/src/apis/Instances.js:71 (the CA reads labels from the `/instances` payload; no direct `GET /labels`)
        $this->actingAs($this->user())
            ->withHeader('Origin', 'https://evil.example.com')
            ->getJson('/api/labels')
            ->assertOk();
    }
}
