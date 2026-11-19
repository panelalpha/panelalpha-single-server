<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * PUT /user/password. The change is rate-limited and held to the single
 * panel-user password policy.
 * @see packages/api/routes/api.php:717 (old /user/edit); the profile-change rules
 */
class PasswordChangeTest extends TestCase
{
    use RefreshDatabase;

    public function test_changing_the_password_requires_the_current_one(): void
    {
        $user = User::factory()->create(['password' => 'old-password']);

        // CA: packages/client-area/src/mixins/ChangePasswordMixin.js:91 (`Api.put('/user/password', formData)`)
        // CA reads: packages/client-area/src/mixins/ChangePasswordMixin.js:102-104 (the CA shows `errors.password[0]`,
        // which the old panel never sets, else the top-level `message` it falls back to)
        $this->actingAs($user)
            ->putJson('/api/user/password', [
                'current_password' => 'wrong-password',
                'password' => 'New-Password1!',
                'password_confirmation' => 'New-Password1!',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password')
            ->assertJsonPath('message', 'The provided password does not match your current password.');

        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    public function test_changing_the_password_succeeds(): void
    {
        $user = User::factory()->create(['password' => 'old-password']);

        // CA: packages/client-area/src/mixins/ChangePasswordMixin.js:91 (`Api.put('/user/password', formData)`)
        // CA reads: packages/client-area/src/mixins/ChangePasswordMixin.js:91 (the CA's success alert)
        $this->actingAs($user)
            ->putJson('/api/user/password', [
                'current_password' => 'old-password',
                'password' => 'New-Password1!',
                'password_confirmation' => 'New-Password1!',
            ])
            ->assertOk()
            ->assertJson(['success' => true]);

        $this->assertTrue(Hash::check('New-Password1!', $user->fresh()->password));
    }

    public function test_password_change_clears_password_change_required(): void
    {
        $user = User::factory()->create([
            'password' => 'old-password',
            'password_change_required' => true,
        ]);

        // CA: packages/client-area/src/mixins/ChangePasswordMixin.js:91 (`Api.put('/user/password', formData)`)
        $this->actingAs($user)
            ->putJson('/api/user/password', [
                'current_password' => 'old-password',
                'password' => 'New-Password1!',
                'password_confirmation' => 'New-Password1!',
            ])
            ->assertOk();

        $this->assertFalse($user->fresh()->password_change_required);
    }

    public function test_generated_password_user_sets_a_password_without_the_current_one(): void
    {
        $user = User::factory()->create(['password_generated' => true]);

        // CA: packages/client-area/src/mixins/ChangePasswordMixin.js:91 (`Api.put('/user/password', formData)`)
        // CA reads: packages/client-area/src/mixins/ChangePasswordMixin.js:91 (the CA's success alert)
        $this->actingAs($user)
            ->putJson('/api/user/password', [
                'password' => 'New-Password1!',
                'password_confirmation' => 'New-Password1!',
            ])
            ->assertOk()
            ->assertJson(['success' => true]);

        $user->refresh();
        $this->assertTrue(Hash::check('New-Password1!', $user->password));
        $this->assertFalse($user->password_generated);
    }

    public function test_generated_password_user_still_needs_a_valid_new_password(): void
    {
        $user = User::factory()->create(['password_generated' => true]);

        // CA: packages/client-area/src/mixins/ChangePasswordMixin.js:91 (`Api.put('/user/password', formData)`)
        // CA reads: packages/client-area/src/mixins/ChangePasswordMixin.js:102-104 (the CA shows `errors.password[0]`)
        $this->actingAs($user)
            ->putJson('/api/user/password', [
                'password' => 'weak',
                'password_confirmation' => 'weak',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');

        $this->assertTrue($user->fresh()->password_generated);
    }

    public function test_normal_user_still_needs_the_current_password(): void
    {
        $user = User::factory()->create(['password' => 'old-password']);

        // CA: packages/client-area/src/mixins/ChangePasswordMixin.js:91 (`Api.put('/user/password', formData)`)
        // CA reads: packages/client-area/src/mixins/ChangePasswordMixin.js:102-104 (the CA shows `errors.password[0]`)
        $this->actingAs($user)
            ->putJson('/api/user/password', [
                'password' => 'New-Password1!',
                'password_confirmation' => 'New-Password1!',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');

        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    public function test_password_change_requires_authentication(): void
    {
        // CA: packages/client-area/src/mixins/ChangePasswordMixin.js:91
        $this->putJson('/api/user/password', [
            'current_password' => 'x',
            'password' => 'New-Password1!',
            'password_confirmation' => 'New-Password1!',
        ])->assertUnauthorized();
    }
}
