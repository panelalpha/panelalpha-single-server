<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * @see Host CLI (users:create/list/…)
 */
class UsersCommandsTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_update_password_clears_password_generated(): void
    {
        $user = User::factory()->create(['email' => 'gen@example.com', 'password_generated' => true]);

        $this->artisan('users:update', [
            'email' => 'gen@example.com',
            '--password' => 'Updated-Password1!',
        ])->assertSuccessful();

        $this->assertFalse($user->fresh()->password_generated);
    }

    public function test_users_create_list_show_update_delete(): void
    {
        $this->artisan('users:create', [
            'email' => 'demo@example.com',
            'password' => 'Valid-Password1!',
        ])->assertSuccessful();

        $this->assertDatabaseHas('users', ['email' => 'demo@example.com']);

        $this->artisan('users:list')->assertSuccessful();

        $this->artisan('users:show', ['email' => 'demo@example.com'])
            ->assertSuccessful()
            ->expectsOutputToContain('demo@example.com');

        $this->artisan('users:update', [
            'email' => 'demo@example.com',
        ])
            ->assertSuccessful()
            ->expectsOutputToContain('--email')
            ->expectsOutputToContain('--password');

        $this->artisan('users:update', [
            'email' => 'demo@example.com',
            '--password' => 'Updated-Password1!',
        ])->assertSuccessful()->expectsOutputToContain('User updated');

        $user = User::query()->where('email', 'demo@example.com')->firstOrFail();
        $this->assertTrue(Hash::check('Updated-Password1!', $user->password));

        $this->artisan('users:update', [
            'email' => 'demo@example.com',
            '--email' => 'renamed@example.com',
        ])->assertSuccessful();

        $this->assertDatabaseHas('users', ['email' => 'renamed@example.com']);
        $this->assertDatabaseMissing('users', ['email' => 'demo@example.com']);

        $this->artisan('users:delete', ['email' => 'renamed@example.com'])
            ->assertSuccessful();

        $this->assertDatabaseMissing('users', ['email' => 'renamed@example.com']);
    }
}
