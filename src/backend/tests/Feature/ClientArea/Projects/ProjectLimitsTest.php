<?php

namespace Tests\Feature\ClientArea\Projects;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * PUT /projects/{id}/limits (project-usage, phase 2): the client changes the six
 * limits of one project. The route has no old-panel counterpart (the old panel
 * let only the admin do it), so the `CA:` citations point at the closest real
 * old-panel call, the project update for a domain change (SetYourDomainModal.vue).
 * The citation guard only accepts files of the old Client Area. The real caller of
 * this route is the new Client Area front: `updateLimits` in
 * src/views/projects/project/instance.api.ts and the field errors in
 * src/views/projects/project/advanced/details/ProjectLimitsModal.vue.
 *
 * Contract:
 * - Engine: `PUT /projects/{u}` takes the six keys and answers the project
 *   resource; a refused value is a 422 with `errors` and `problems[]`.
 * - Community: no ceilings; the answer is mirrored into `engine_payload`.
 */
final class ProjectLimitsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const KEYS = ['memory_limit', 'cpu_limit', 'disk_space_limit', 'inodes_limit', 'device_read_bps', 'device_write_bps'];

    /**
     * @return array<string, int|float>
     */
    private function body(): array
    {
        return [
            'memory_limit' => 1024,
            'cpu_limit' => 1.5,
            'disk_space_limit' => 20480,
            'inodes_limit' => -1,
            'device_read_bps' => 10485760,
            'device_write_bps' => -1,
        ];
    }

    private function application(User $user): Application
    {
        return $this->syncedApplication($user, 'site1', [
            'config' => ['memory_limit' => 512, 'cpu_limit' => 1, 'disk_space_limit' => 10240],
        ]);
    }

    public function test_it_sends_the_six_values_to_the_engine_and_mirrors_the_answer(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', [
            'config' => $this->body(),
            'usage' => null,
        ])])]);

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/limits", $this->body())
            ->assertOk()
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (`response.data.data`)
            ->assertJsonPath('data.limits.memory_limit', 1024)
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (`response.data.data`)
            ->assertJsonPath('data.limits.cpu_limit', 1.5)
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (`response.data.data`)
            ->assertJsonPath('data.limits.inodes_limit', -1)
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (`response.data.data`)
            ->assertJsonPath('data.ceilings.memory_limit', null);

        Http::assertSent(function ($r): bool {
            if ($r->method() !== 'PUT' || ! str_ends_with($r->url(), '/projects/site1')) {
                return false;
            }
            foreach ($this->body() as $key => $value) {
                if ($r[$key] !== $value) {
                    return false;
                }
            }

            return count($r->data()) === count(self::KEYS);
        });

        $payload = $application->fresh()?->engine_payload;
        $this->assertIsArray($payload);
        $this->assertSame(1024, $payload['config']['memory_limit']);
    }

    public function test_it_needs_a_signed_in_user(): void
    {
        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->putJson('/api/projects/1/limits', $this->body())->assertUnauthorized();
    }

    public function test_a_project_the_user_cannot_see_is_not_found(): void
    {
        // Community shows every project to every user, so the route's 404 is an unknown
        // project; the paid editions scope the same binding per user (phase 3 tests it).
        $user = User::factory()->create();
        $this->application($user);

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson('/api/projects/999999/limits', $this->body())
            ->assertNotFound();

        Http::assertNotSent(fn ($r) => $r->method() === 'PUT');
    }

    public function test_it_needs_the_manage_limits_privilege(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->denyPrivilege('general.manage_limits');
        Http::fake();

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/limits", $this->body())
            ->assertForbidden();

        Http::assertNothingSent();
    }

    public function test_values_the_rules_refuse_never_reach_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Http::fake();

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/limits", ['memory_limit' => 0, 'cpu_limit' => -2] + $this->body())
            ->assertStatus(422)
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (field errors)
            ->assertJsonValidationErrors(['memory_limit', 'cpu_limit']);

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/limits", ['memory_limit' => 512])
            ->assertStatus(422)
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (field errors)
            ->assertJsonValidationErrors(['cpu_limit', 'disk_space_limit', 'inodes_limit', 'device_read_bps', 'device_write_bps']);

        Http::assertNothingSent();
    }

    public function test_cpu_takes_fractions_of_a_core_and_sends_them_to_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update (HostValues::cpus takes a decimal above 0, 6 places)
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', [
            'config' => ['cpu_limit' => 0.5] + $this->body(),
        ])])]);

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/limits", ['cpu_limit' => 0.5] + $this->body())
            ->assertOk();

        Http::assertSent(fn ($r): bool => $r->method() === 'PUT' && $r['cpu_limit'] === 0.5);

        foreach ([0.01, 1024] as $cpu) {
            // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
            Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['config' => $this->body()])])]);
            // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
            $this->actingAs($user)
                ->putJson("/api/projects/{$application->id}/limits", ['cpu_limit' => $cpu] + $this->body())
                ->assertOk();
        }
    }

    public function test_cpu_below_the_smallest_fraction_is_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Http::fake();

        foreach ([0.009, 0.001, -0.5, -2] as $cpu) {
            // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
            $this->actingAs($user)
                ->putJson("/api/projects/{$application->id}/limits", ['cpu_limit' => $cpu] + $this->body())
                ->assertStatus(422)
                // CA reads: src/components/modal/SetYourDomainModal.vue:751 (field errors)
                ->assertJsonValidationErrors(['cpu_limit']);
        }

        Http::assertNothingSent();
    }

    public function test_zero_reaches_the_engine_as_no_limit_for_the_five_optional_limits(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Rules/UnlimitedOrAtLeastZero.php takes 0 and stores it as "not enforced", the same as -1.
        // An old client sends back the 0 it read; the panel turns it into -1 (the one spelling of "no limit").
        foreach (['cpu_limit', 'disk_space_limit', 'inodes_limit', 'device_read_bps', 'device_write_bps'] as $key) {
            // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
            Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['config' => $this->body()])])]);

            // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
            $this->actingAs($user)
                ->putJson("/api/projects/{$application->id}/limits", [$key => 0] + $this->body())
                ->assertOk();

            Http::assertSent(fn ($r): bool => $r->method() === 'PUT' && $r[$key] === -1 && count($r->data()) === count(self::KEYS));
        }

        // All five at once.
        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['config' => $this->body()])])]);
        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/limits", [
                'cpu_limit' => 0,
                'disk_space_limit' => 0,
                'inodes_limit' => 0,
                'device_read_bps' => 0,
                'device_write_bps' => 0,
            ] + $this->body())
            ->assertOk();
        Http::assertSent(fn ($r): bool => $r['cpu_limit'] === -1 && $r['disk_space_limit'] === -1 && $r['inodes_limit'] === -1
            && $r['device_read_bps'] === -1 && $r['device_write_bps'] === -1);
    }

    public function test_zero_memory_is_still_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Http::fake();

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/limits", ['memory_limit' => 0] + $this->body())
            ->assertStatus(422)
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (field errors)
            ->assertJsonValidationErrors(['memory_limit']);

        Http::assertNothingSent();
    }

    public function test_too_large_values_are_refused_before_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Http::fake();

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/limits", [
                'memory_limit' => 2147483648,
                'cpu_limit' => 1025,
                'disk_space_limit' => 2147483648,
                'inodes_limit' => 99999999999999999999,
                'device_read_bps' => 2147483648,
                'device_write_bps' => 2147483648,
            ])
            ->assertStatus(422)
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (field errors)
            ->assertJsonValidationErrors(['memory_limit', 'cpu_limit', 'disk_space_limit', 'inodes_limit', 'device_read_bps', 'device_write_bps']);

        Http::assertNothingSent();
    }

    public function test_an_engine_422_keeps_the_field_key(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update (422 from UserUpdateRequest)
        Http::fake(['engine.example.com/api/projects/site1' => Http::response([
            'message' => 'The memory limit is too large.',
            'errors' => ['memory_limit' => ['The memory limit is too large.']],
            'problems' => [['field' => 'memory_limit', 'code' => 'memory_limit_too_large', 'message' => 'The memory limit is too large.', 'max_mb' => 3500]],
        ], 422)]);

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/limits", ['memory_limit' => 999999] + $this->body())
            ->assertStatus(422)
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (field errors)
            ->assertJsonValidationErrors(['memory_limit']);

        $payload = $application->fresh()?->engine_payload;
        $this->assertIsArray($payload);
        $this->assertSame(512, $payload['config']['memory_limit']);
    }

    public function test_an_engine_that_is_down_gives_the_usual_error(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update (unreachable)
        Http::fake(fn () => throw new ConnectionException('Engine down'));

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $response = $this->actingAs($user)->putJson("/api/projects/{$application->id}/limits", $this->body());

        $this->assertGreaterThanOrEqual(500, $response->getStatusCode());
        $this->assertLessThan(600, $response->getStatusCode());
    }

    public function test_a_staging_project_is_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['staging_of_id' => $application->id])->save();
        Http::fake();

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)
            ->putJson("/api/projects/{$application->id}/limits", $this->body())
            ->assertStatus(422)
            // CA reads: src/components/modal/SetYourDomainModal.vue:751 (field errors)
            ->assertJsonValidationErrors(['project'])
            ->assertJsonPath('errors.project.0', trans('client-area::general.limits_staging_refused'));

        Http::assertNothingSent();
    }

    public function test_the_change_is_logged_with_the_six_values(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1352 -> UserController::update
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => $this->engineProject(10, 'site1', ['config' => $this->body()])])]);

        // CA: packages/client-area/src/components/modal/SetYourDomainModal.vue:746
        $this->actingAs($user)->putJson("/api/projects/{$application->id}/limits", $this->body())->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'user.instance.update_limits',
            'user_id' => $user->id,
            'application_id' => $application->id,
        ]);
        $row = \PanelAlpha\ClientArea\Models\ActivityLog::query()->where('action', 'user.instance.update_limits')->firstOrFail();
        $this->assertSame($this->body(), $row->payload['App\\Models\\Application:'.$application->id] ?? null);
    }
}
