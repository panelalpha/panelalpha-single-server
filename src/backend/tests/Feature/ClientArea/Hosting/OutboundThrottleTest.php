<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * One 429 test for every route that keeps `throttle:outbound`: the limiter is 10/min per user. `test-git-url`
 * (OnboardingSourceTest) and `domains/resolve` (ServiceDomainTest) already have
 * their own. The two fixed-host wordpress.org reads must stay unthrottled, as
 * the old routes were.
 */
class OutboundThrottleTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        // The pinned-probe routes resolve the Engine host as the fallback;
        // the fakes keep the throttle loops off DNS and sockets.
        $this->fakeHostResolver();
        $this->fakePinnedProbe();
    }

    /**
     * Send the same call until the limiter answers 429, and return how many
     * requests were allowed.
     */
    private function requestsUntilThrottled(User $user, callable $request, int $limit = 10): void
    {
        $this->actingAs($user);

        for ($attempt = 1; $attempt <= $limit; $attempt++) {
            $this->assertNotSame(429, $request($attempt)->status(), "request {$attempt} of {$limit} was throttled");
        }

        $request($limit + 1)->assertStatus(429);
    }

    private function exhaustOutbound(User $user): void
    {
        for ($i = 0; $i < 10; $i++) {
// CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:248
            $this->actingAs($user)->postJson('/api/projects/git-branches', [])->assertStatus(422);
        }
// CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:248
        $this->actingAs($user)->postJson('/api/projects/git-branches', [])->assertStatus(429);
    }

    public function test_git_branches_and_preview_env_are_rate_limited(): void
    {
        $user = User::factory()->create();

        $this->requestsUntilThrottled($user, fn (int $i) => $i % 2 === 0
// CA: packages/client-area/src/components/onboarding/OnboardingDeployFromGitModal.vue:248
            ? $this->postJson('/api/projects/git-branches', [])
// CA: packages/client-area/src/components/onboarding/OnboardingEnvVarsModal.vue:239
            : $this->postJson('/api/projects/preview-env-example', []));
    }

    public function test_the_onboarding_certificate_probe_is_rate_limited(): void
    {
        $user = User::factory()->create();

        // Both spellings share the bucket; an unknown domain is a 422 that never
        // opens a socket.
        $this->requestsUntilThrottled($user, fn (int $i) => $i % 2 === 0
// CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:72
            ? $this->getJson('/api/projects/onboarding/ssl-certificate?domain=foreign.example.com')
// CA: packages/client-area/src/mixins/Onboarding/SuperQuickOnboardingMixin.js:72
            : $this->getJson('/api/instances/onboarding/ssl-certificate?domain=foreign.example.com'));
    }

    public function test_the_instance_ssl_detected_probe_has_its_own_limiter(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:46 -> domains list
        Http::fake(['engine.example.com/api/projects/site1/domains*' => Http::response(['data' => []])]);

        $this->exhaustOutbound($user);

        // A foreign domain is refused before the Engine certificate is read.
// CA: packages/client-area/src/apis/Hosting.js:47
        $this->requestsUntilThrottled($user, fn () => $this->getJson(
            "/api/server-accounts/{$application->id}/ssl/certificate/detected?domain=foreign.example.com",
        ), 120);
    }

    public function test_the_detected_by_url_probe_has_its_own_limiter_on_both_spellings(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:140 -> ssl-check
        Http::fake(['engine.example.com/api/projects/site1/domains/*/ssl-check' => Http::response(['data' => $this->engineSslCheck()])]);

        $this->exhaustOutbound($user);

        $this->requestsUntilThrottled($user, fn (int $i) => $i % 2 === 0
// CA: packages/client-area/src/components/cards/SecurityInfoCard.vue:199
            ? $this->getJson("/api/projects/{$application->id}/ssl/certificate/detected-by-url")
// CA: packages/client-area/src/components/cards/SecurityInfoCard.vue:199
            : $this->getJson("/api/instances/{$application->id}/ssl/certificate/detected-by-url"), 120);
    }

    public function test_git_connect_and_credentials_are_rate_limited(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // Missing fields → 422 before the service (and thus before any host guard).
        $this->requestsUntilThrottled($user, fn (int $i) => $i % 2 === 0
// CA: packages/client-area/src/views/instance/advanced/Git.vue:1199
            ? $this->postJson("/api/projects/{$application->id}/git/connect", [])
// CA: packages/client-area/src/mixins/GitActionsMixin.js:464
            : $this->putJson("/api/projects/{$application->id}/git/credentials", []));
    }

    public function test_the_fixed_host_wordpress_reads_are_not_throttled(): void
    {
        // External: api.wordpress.org
        Http::fake(['api.wordpress.org/*' => Http::response(['offers' => [], 'themes' => [], 'info' => []])]);
        $user = User::factory()->create();

        // 11 calls to each spelling (the whole outbound bucket) still answer,
        // because the fixed third-party host keeps the old route's (absent)
        // throttle. Re-adding `throttle:outbound` makes that spelling's 11th
        // call a 429 and fails here.
        for ($i = 0; $i < 11; $i++) {
            foreach ([
                '/api/projects/wordpress-versions',
                '/api/instances/wordpress-versions',
                '/api/projects/onboarding/themes',
                '/api/instances/onboarding/themes',
            ] as $path) {
// CA: packages/client-area/src/components/onboarding/OnboardingStandardFormModal.vue:1003
                $this->actingAs($user)->getJson($path)->assertOk();
            }
        }
    }
}
