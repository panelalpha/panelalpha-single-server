<?php

namespace Tests\Unit\Packages\Host;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The `users:*` commands of the host: arguments, prompts, validation messages,
 * exit codes and what is stored.
 */
final class UsersCommandsTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'Valid-Password1!';

    public function test_create_lowercases_and_trims_the_email_and_stores_a_hashed_password(): void
    {
        $this->artisan('users:create', ['email' => '  Demo.User@Example.COM ', 'password' => self::PASSWORD])
            ->expectsOutputToContain('User created: demo.user@example.com')
            ->expectsOutputToContain('Log in with this exact email.')
            ->assertSuccessful();

        $user = User::query()->where('email', 'demo.user@example.com')->firstOrFail();
        $this->assertTrue(Hash::check(self::PASSWORD, $user->password));
        $this->assertSame('demo.user', $user->name);
        $this->assertFalse((bool) $user->password_generated);
    }

    public function test_create_without_a_password_prompts_for_it_twice(): void
    {
        $this->artisan('users:create', ['email' => 'prompted@example.com'])
            ->expectsQuestion('Password', self::PASSWORD)
            ->expectsQuestion('Confirm password', self::PASSWORD)
            ->assertSuccessful();

        $this->assertTrue(Hash::check(self::PASSWORD, User::query()->where('email', 'prompted@example.com')->firstOrFail()->password));
    }

    public function test_create_with_an_empty_password_argument_also_prompts(): void
    {
        $this->artisan('users:create', ['email' => 'empty@example.com', 'password' => ''])
            ->expectsQuestion('Password', self::PASSWORD)
            ->expectsQuestion('Confirm password', self::PASSWORD)
            ->assertSuccessful();

        $this->assertDatabaseHas('users', ['email' => 'empty@example.com']);
    }

    public function test_create_fails_and_stores_nothing_when_the_prompted_passwords_differ(): void
    {
        $this->artisan('users:create', ['email' => 'mismatch@example.com'])
            ->expectsQuestion('Password', self::PASSWORD)
            ->expectsQuestion('Confirm password', 'Another-Password2!')
            ->expectsOutputToContain('Passwords do not match.')
            ->assertFailed();

        $this->assertDatabaseCount('users', 0);
    }

    public function test_create_prints_each_validation_error_and_fails(): void
    {
        $this->artisan('users:create', ['email' => 'not-an-email', 'password' => 'weak'])
            ->expectsOutputToContain('email')
            ->assertFailed();

        $this->assertDatabaseCount('users', 0);
    }

    public function test_create_refuses_an_email_that_is_taken_in_any_letter_case(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $this->artisan('users:create', ['email' => 'TAKEN@example.com', 'password' => self::PASSWORD])
            ->expectsOutputToContain('The email has already been taken.')
            ->assertFailed();

        $this->assertDatabaseCount('users', 1);
    }

    public function test_list_says_when_there_are_no_users(): void
    {
        $this->artisan('users:list')->expectsOutput('No users.')->assertSuccessful();
    }

    public function test_list_shows_every_user_by_id_with_the_creation_time(): void
    {
        $this->travelTo('2026-11-09 10:30:00');
        User::factory()->create(['email' => 'first@example.com', 'name' => 'First']);
        User::factory()->create(['email' => 'second@example.com', 'name' => 'Second']);

        $this->artisan('users:list')
            ->expectsTable(['ID', 'Name', 'Email', 'Created'], [
                [1, 'First', 'first@example.com', '2026-11-09 10:30:00'],
                [2, 'Second', 'second@example.com', '2026-11-09 10:30:00'],
            ])
            ->assertSuccessful();
    }

    public function test_show_prints_the_fields_of_the_user(): void
    {
        $this->travelTo('2026-11-09 10:30:00');
        User::factory()->create(['email' => 'show@example.com', 'name' => 'Show Me', 'email_verified_at' => null]);

        $this->artisan('users:show', ['email' => 'show@example.com'])
            ->expectsTable(['Field', 'Value'], [
                ['id', 1],
                ['name', 'Show Me'],
                ['email', 'show@example.com'],
                ['email_verified_at', ''],
                ['created_at', '2026-11-09 10:30:00'],
                ['updated_at', '2026-11-09 10:30:00'],
            ])
            ->assertSuccessful();
    }

    public function test_show_fails_for_an_unknown_email(): void
    {
        $this->artisan('users:show', ['email' => 'nobody@example.com'])
            ->expectsOutputToContain('User not found: nobody@example.com')
            ->assertFailed();
    }

    public function test_delete_removes_the_user_and_says_so(): void
    {
        User::factory()->create(['email' => 'gone@example.com']);
        User::factory()->create(['email' => 'stays@example.com']);

        $this->artisan('users:delete', ['email' => 'gone@example.com'])
            ->expectsOutputToContain('User deleted: gone@example.com')
            ->assertSuccessful();

        $this->assertDatabaseMissing('users', ['email' => 'gone@example.com']);
        $this->assertDatabaseHas('users', ['email' => 'stays@example.com']);
    }

    public function test_delete_fails_for_an_unknown_email_and_removes_nothing(): void
    {
        User::factory()->create(['email' => 'stays@example.com']);

        $this->artisan('users:delete', ['email' => 'nobody@example.com'])
            ->expectsOutputToContain('User not found: nobody@example.com')
            ->assertFailed();

        $this->assertDatabaseCount('users', 1);
    }

    public function test_update_without_options_prints_the_usage_and_changes_nothing(): void
    {
        $user = User::factory()->create(['email' => 'same@example.com']);

        $this->artisan('users:update', ['email' => 'same@example.com'])
            ->expectsOutputToContain('Examples:')
            ->expectsOutputToContain('php artisan users:update user@example.com --email=new@example.com')
            ->assertSuccessful();

        $this->assertSame('same@example.com', $user->fresh()?->email);
    }

    public function test_update_with_empty_options_is_the_same_as_none(): void
    {
        User::factory()->create(['email' => 'same@example.com']);

        $this->artisan('users:update', ['email' => 'same@example.com', '--email' => '', '--password' => ''])
            ->expectsOutputToContain('Examples:')
            ->assertSuccessful();
    }

    public function test_update_fails_for_an_unknown_user(): void
    {
        $this->artisan('users:update', ['email' => 'Nobody@Example.com', '--password' => self::PASSWORD])
            ->expectsOutputToContain('User not found: nobody@example.com')
            ->assertFailed();
    }

    public function test_update_finds_the_user_in_any_letter_case(): void
    {
        $user = User::factory()->create(['email' => 'case@example.com']);

        $this->artisan('users:update', ['email' => 'CASE@Example.com', '--password' => self::PASSWORD])->assertSuccessful();

        $this->assertTrue(Hash::check(self::PASSWORD, $user->fresh()?->password ?? ''));
    }

    public function test_update_changes_the_email_and_follows_the_name_when_it_was_the_local_part(): void
    {
        $user = User::factory()->create(['email' => 'old.name@example.com', 'name' => 'old.name']);

        $this->artisan('users:update', ['email' => 'old.name@example.com', '--email' => ' New.Name@Example.com '])
            ->expectsOutputToContain('User updated: old.name@example.com (email=new.name@example.com)')
            ->assertSuccessful();

        $fresh = $user->fresh();
        $this->assertSame('new.name@example.com', $fresh?->email);
        $this->assertSame('new.name', $fresh?->name);
    }

    public function test_update_follows_the_name_when_it_was_the_whole_email(): void
    {
        $user = User::factory()->create(['email' => 'whole@example.com', 'name' => 'whole@example.com']);

        $this->artisan('users:update', ['email' => 'whole@example.com', '--email' => 'next@example.com'])->assertSuccessful();

        $this->assertSame('next', $user->fresh()?->name);
    }

    public function test_update_keeps_a_name_the_person_chose(): void
    {
        $user = User::factory()->create(['email' => 'ada@example.com', 'name' => 'Ada Lovelace']);

        $this->artisan('users:update', ['email' => 'ada@example.com', '--email' => 'countess@example.com'])->assertSuccessful();

        $this->assertSame('Ada Lovelace', $user->fresh()?->name);
    }

    public function test_update_changes_the_password_hides_it_in_the_output_and_clears_the_generated_flag(): void
    {
        $user = User::factory()->create(['email' => 'pw@example.com', 'password_generated' => true]);

        $this->artisan('users:update', ['email' => 'pw@example.com', '--password' => self::PASSWORD])
            ->expectsOutputToContain('User updated: pw@example.com (password=***)')
            ->doesntExpectOutputToContain(self::PASSWORD)
            ->assertSuccessful();

        $this->assertTrue(Hash::check(self::PASSWORD, $user->fresh()?->password ?? ''));
        $this->assertFalse((bool) $user->fresh()?->password_generated);
    }

    public function test_update_can_change_both_in_one_call(): void
    {
        User::factory()->create(['email' => 'both@example.com']);

        $this->artisan('users:update', ['email' => 'both@example.com', '--email' => 'either@example.com', '--password' => self::PASSWORD])
            ->expectsOutputToContain('(email=either@example.com, password=***)')
            ->assertSuccessful();
    }

    public function test_update_refuses_an_email_that_belongs_to_someone_else_but_not_the_users_own(): void
    {
        User::factory()->create(['email' => 'other@example.com']);
        $user = User::factory()->create(['email' => 'mine@example.com']);

        $this->artisan('users:update', ['email' => 'mine@example.com', '--email' => 'other@example.com'])
            ->expectsOutputToContain('The email has already been taken.')
            ->assertFailed();
        $this->assertSame('mine@example.com', $user->fresh()?->email);

        $this->artisan('users:update', ['email' => 'mine@example.com', '--email' => 'mine@example.com'])->assertSuccessful();
    }

    public function test_update_refuses_an_email_that_is_not_an_address_and_a_weak_password(): void
    {
        $user = User::factory()->create(['email' => 'mine@example.com']);
        $before = $user->password;

        $this->artisan('users:update', ['email' => 'mine@example.com', '--email' => 'not-an-email'])
            ->expectsOutputToContain('email')
            ->assertFailed();
        $this->artisan('users:update', ['email' => 'mine@example.com', '--password' => 'weak'])
            ->expectsOutputToContain('password')
            ->assertFailed();

        $this->assertSame('mine@example.com', $user->fresh()?->email);
        $this->assertSame($before, $user->fresh()?->password);
    }
}
