<?php

namespace Tests\Feature\ClientArea\Activity;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Route;
use PanelAlpha\ClientArea\Models\ActivityLog;
use RuntimeException;
use Tests\TestCase;

/**
 * The branches of the `activity` middleware that decide whether and how an entry
 * is written: failed requests, the action override, the stored URI length and a
 * failing log write.
 *
 * Contract:
 * - CA: `packages/client-area/src/mixins/InstanceActionsMixin.js:386` (the CA only reads the entries back).
 * - Old: `packages/api/routes/api.php` (`LogRequests` logged successful mutating requests only).
 * - Engine: none (the activity log is panel-only).
 */
final class LogActivityMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_failed_mutating_request_logs_nothing(): void
    {
        $user = User::factory()->create();
        Route::middleware(['api', 'auth', 'activity'])
            ->post('/api/test/failing-activity', fn () => response()->json(['message' => 'No'], 422))
            ->defaults('activity', 'user.instance.test_thing');

        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)->postJson('/api/test/failing-activity')->assertStatus(422);

        $this->assertDatabaseCount('activity_logs', 0);
    }

    public function test_an_action_set_by_the_controller_wins_over_the_route_default(): void
    {
        $user = User::factory()->create();
        Route::middleware(['api', 'auth', 'activity'])
            ->post('/api/test/overridden-activity', function () {
                request()->attributes->set('activity_action', 'user.instance.test_override');

                return response()->json(['ok' => true]);
            })
            ->defaults('activity', 'user.instance.test_default');

        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)->postJson('/api/test/overridden-activity')->assertOk();

        $this->assertDatabaseHas('activity_logs', ['action' => 'user.instance.test_override', 'user_id' => $user->id]);
        $this->assertDatabaseMissing('activity_logs', ['action' => 'user.instance.test_default']);
    }

    public function test_an_empty_action_override_falls_back_to_the_route_default(): void
    {
        $user = User::factory()->create();
        Route::middleware(['api', 'auth', 'activity'])
            ->post('/api/test/empty-override-activity', function () {
                request()->attributes->set('activity_action', '');

                return response()->json(['ok' => true]);
            })
            ->defaults('activity', 'user.instance.test_default');

        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)->postJson('/api/test/empty-override-activity')->assertOk();

        $this->assertDatabaseHas('activity_logs', ['action' => 'user.instance.test_default']);
    }

    public function test_a_long_request_path_is_stored_cut_to_255_characters(): void
    {
        $user = User::factory()->create();
        Route::middleware(['api', 'auth', 'activity'])
            ->post('/api/test/long-uri/{tail}', fn () => response()->json(['ok' => true]))
            ->defaults('activity', 'user.instance.test_thing');

        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)->postJson('/api/test/long-uri/'.str_repeat('a', 400))->assertOk();

        $this->assertSame(255, mb_strlen((string) ActivityLog::query()->firstOrFail()->request_uri));
    }

    public function test_a_failing_log_write_is_reported_and_does_not_fail_the_request(): void
    {
        Exceptions::fake();
        $user = User::factory()->create();
        Route::middleware(['api', 'auth', 'activity'])
            ->post('/api/test/unwritable-activity', fn () => response()->json(['ok' => true]))
            ->defaults('activity', 'user.instance.test_thing');
        ActivityLog::creating(static function (): never {
            throw new RuntimeException('log table is gone');
        });

        // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:386
        $this->actingAs($user)
            // CA: packages/client-area/src/mixins/InstanceActionsMixin.js:386
            ->postJson('/api/test/unwritable-activity')
            ->assertOk();

        Exceptions::assertReported(static fn (RuntimeException $e): bool => $e->getMessage() === 'log table is gone');
        $this->assertDatabaseCount('activity_logs', 0);
    }
}
