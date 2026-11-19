<?php

namespace Tests\Feature\ClientArea\Activity;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PanelAlpha\ClientArea\Contracts\ActingAdmin;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Support\NoActingAdmin;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * Community has no admin, so the controller's `ActingAdmin` default answers nobody and every
 * entry is the user's – even a session that carries the paid edition's "login as user" mark (`adminloggedasuser`,
 * which only the paid `/sso-login` sets) records no admin, and the project's logs list the entry.
 *
 * Contract:
 * - CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`), :236 (the project's label,
 *   rewritten to `/projects`), :15 (the project's logs).
 * - Engine: none but the mirror (`syncedApplication()`).
 */
final class CommunityActingAdminTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_community_records_every_entry_as_the_users(): void
    {
        $this->assertInstanceOf(NoActingAdmin::class, app(ActingAdmin::class));
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // CA: packages/client-area/src/router/fetchData.js:263 (`Api.post('/labels', label)`)
        $this->actingAs($user)->withSession(['adminloggedasuser' => true])->postJson('/api/labels', ['title' => 'Prod', 'color' => '#ff0000'])->assertOk();
        // CA: packages/client-area/src/router/fetchData.js:236 (`Api.post('/instances/{id}/labels', label)`, rewritten to /projects)
        $this->actingAs($user)->withSession(['adminloggedasuser' => true])->postJson("/api/projects/{$application->id}/labels", ['title' => 'Prod'])->assertOk();

        $entry = ActivityLog::query()->where('action', 'user.instance.assign_label')->sole();
        $this->assertNull($entry->admin_as_user);
        $this->assertNull($entry->admin_id);

        // CA: packages/client-area/src/router/fetchData.js:15
        // CA reads: packages/client-area/src/router/fetchData.js:16-19 (`meta`, `data`); packages/client-area/src/components/logs/LogItem.vue:65 (`action`)
        $this->actingAs($user)->getJson("/api/projects/{$application->id}/logs")
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.action', 'user.instance.assign_label');
    }
}
