<?php

namespace Tests\Feature\Account;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Tests\TestCase;

/**
 * The notification routes: /notifications list/clear/mark-as-read/delete.
 * @see packages/api/routes/api.php:702-703 (old /notifications routes)
 * @see packages/client-area/src/components/navbar/NotificationsManager.vue:10
 */
class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private function notification(User $user, array $overrides = []): DatabaseNotification
    {
        return $user->notifications()->create(array_merge([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            // `databaseType()` stores the CA type in the `type` column.
            'type' => 'user.instance.redeploy_finished',
            'data' => ['type' => 'user.instance.redeploy_finished', 'enabled' => true],
            'read_at' => null,
        ], $overrides));
    }

    public function test_lists_notifications_with_meta(): void
    {
        $user = User::factory()->create();
        $notification = $this->notification($user, ['read_at' => now()->subHour()]);

        // CA: packages/client-area/src/store/NotificationsModule.js:48 (`Api.get('/notifications')`)
        // CA reads: packages/client-area/src/store/NotificationsModule.js:49-50 (`response.data.data`, `response.data.meta.total`)
        $response = $this->actingAs($user)
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.type', 'user.instance.redeploy_finished')
            ->assertJsonPath('data.0.data.type', 'user.instance.redeploy_finished')
            ->assertJsonPath('meta.total', 1);

        // CA reads: packages/client-area/src/components/navbar/NotificationsManager.vue:7 (`item.id`)
        $this->assertSame($notification->id, $response->json('data.0.id'));
        // CA reads: packages/client-area/src/store/NotificationsModule.js:26 (`notification.read_at`)
        $this->assertNotNull($response->json('data.0.read_at'));
        // CA reads: packages/client-area/src/components/navbar/NotificationsDropdown.vue:64 (`item.created_at_text = moment(item.created_at)…`)
        $this->assertIsString($response->json('data.0.created_at'));
    }

    public function test_marks_notifications_as_read(): void
    {
        $user = User::factory()->create();
        $old = $this->notification($user, ['created_at' => now()->subHours(2)]);
        $new = $this->notification($user, ['created_at' => now()]);

        // The CA sends the cutoff as a query parameter (`?read_at=`); the
        // controller honours it, so an older notification is marked and a
        // newer one is left untouched.
        // CA: packages/client-area/src/store/NotificationsModule.js:31 (`Api.put('/notifications/mark-as-read?read_at=' + time)`)
        $this->actingAs($user)
            ->putJson('/api/notifications/mark-as-read?read_at='.urlencode(now()->subHour()->toISOString()))
            ->assertOk();

        $this->assertNotNull($old->fresh()->read_at);
        $this->assertNull($new->fresh()->read_at);
    }

    public function test_deletes_one_notification(): void
    {
        $user = User::factory()->create();
        $notification = $this->notification($user);

        // CA: packages/client-area/src/store/NotificationsModule.js:20 (`Api.delete('/notifications/{id}')`)
        $this->actingAs($user)->deleteJson("/api/notifications/{$notification->id}")->assertOk();

        $this->assertDatabaseMissing('notifications', ['id' => $notification->id]);
    }

    public function test_clears_notifications_up_to_the_delete_at_query(): void
    {
        $user = User::factory()->create();
        $old = $this->notification($user, ['created_at' => now()->subHours(2)]);
        $new = $this->notification($user, ['created_at' => now()]);

        // The CA sends the cutoff as a query parameter (`?delete_at=`); the
        // controller honours it, so only the older notification is deleted.
        // CA: packages/client-area/src/store/NotificationsModule.js:42 (`Api.delete('/notifications?delete_at=' + time)`)
        $this->actingAs($user)
            ->deleteJson('/api/notifications?delete_at='.urlencode(now()->subHour()->toISOString()))
            ->assertOk();

        $this->assertDatabaseMissing('notifications', ['id' => $old->id]);
        $this->assertDatabaseHas('notifications', ['id' => $new->id]);
    }

    public function test_a_user_cannot_delete_another_users_notification(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $notification = $this->notification($owner);

        // CA: packages/client-area/src/store/NotificationsModule.js:20 (`Api.delete('/notifications/{id}')`)
        $this->actingAs($other)->deleteJson("/api/notifications/{$notification->id}")->assertOk();

        $this->assertDatabaseHas('notifications', ['id' => $notification->id]);
    }

    public function test_marking_as_read_leaves_another_users_notifications_unread(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $ownersNotification = $this->notification($owner, ['created_at' => now()->subHours(2)]);
        $othersNotification = $this->notification($other, ['created_at' => now()->subHours(2)]);

        // CA: packages/client-area/src/store/NotificationsModule.js:31 (`Api.put('/notifications/mark-as-read?read_at=' + time)`)
        $this->actingAs($other)
            ->putJson('/api/notifications/mark-as-read?read_at='.urlencode(now()->subHour()->toISOString()))
            ->assertOk();

        $this->assertNotNull($othersNotification->fresh()->read_at);
        $this->assertNull($ownersNotification->fresh()->read_at);
    }

    public function test_clearing_deletes_only_the_signed_in_users_notifications(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $ownersNotification = $this->notification($owner, ['created_at' => now()->subHours(2)]);
        $othersNotification = $this->notification($other, ['created_at' => now()->subHours(2)]);

        // CA: packages/client-area/src/store/NotificationsModule.js:42 (`Api.delete('/notifications?delete_at=' + time)`)
        $this->actingAs($other)
            ->deleteJson('/api/notifications?delete_at='.urlencode(now()->subHour()->toISOString()))
            ->assertOk();

        $this->assertDatabaseMissing('notifications', ['id' => $othersNotification->id]);
        $this->assertDatabaseHas('notifications', ['id' => $ownersNotification->id]);
    }

    public function test_the_default_page_size_is_ten(): void
    {
        $user = User::factory()->create();
        for ($i = 0; $i < 12; $i++) {
            $this->notification($user);
        }

        // The CA computes `page = length / 10 + 1`.
        // CA: packages/client-area/src/store/NotificationsModule.js:48 (`Api.get('/notifications')`)
        // CA reads: packages/client-area/src/store/NotificationsModule.js:55 (`/notifications?page=' + (length / 10 + 1)`)
        $this->actingAs($user)
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 10)
            ->assertJsonCount(10, 'data');
    }

    public function test_read_and_delete_dates_are_validated(): void
    {
        $user = User::factory()->create();

        // CA: packages/client-area/src/store/NotificationsModule.js:31
        // CA reads: packages/client-area/src/store/NotificationsModule.js:31 (no error body is read; the CA fires and forgets)
        $this->actingAs($user)
            ->putJson('/api/notifications/mark-as-read?read_at=not-a-date')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['read_at']);

        // CA: packages/client-area/src/store/NotificationsModule.js:42
        // CA reads: packages/client-area/src/store/NotificationsModule.js:42
        $this->actingAs($user)
            ->deleteJson('/api/notifications?delete_at=not-a-date')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['delete_at']);
    }

    public function test_notifications_require_authentication(): void
    {
        // CA: packages/client-area/src/store/NotificationsModule.js:48
        $this->getJson('/api/notifications')->assertUnauthorized();
    }
}
