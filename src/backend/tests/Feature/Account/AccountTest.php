<?php

namespace Tests\Feature\Account;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The account routes: /user/edit, /user/edit/email, /user/language, /user/dark-mode.
 * @see packages/api/routes/api.php:717-723 (old account routes)
 * @see packages/client-area/src/apis/Auth.js:273 (logout), views/Login.vue:548 (hub_login)
 */
class AccountTest extends TestCase
{
    use RefreshDatabase;

    public function test_updates_profile(): void
    {
        $user = User::factory()->create();

        // CA: packages/client-area/src/views/Account.vue:512 (`Api.put('/user/edit', this.formValue)`)
        // CA reads: packages/client-area/src/views/Account.vue:512 (the old body's `success` key the CA expects)
        $this->actingAs($user)
            ->putJson('/api/user/edit', [
                'first_name' => 'Ada',
                'last_name' => 'Lovelace',
                'company_name' => 'Example',
                'language' => 'en',
                'new_device_detection' => 'ip, device',
            ])
            ->assertOk()
            ->assertJson(['success' => true]);

        $user->refresh();
        $this->assertSame('Ada', $user->first_name);
        $this->assertSame('Lovelace', $user->last_name);
        $this->assertSame('Example', $user->company_name);
        $this->assertSame('ip, device', $user->new_device_detection);
    }

    /**
     * Both names are required and at most 20 characters, which is what the form's
     * `NAME_MAX_LENGTH` enforces; the endpoint used to accept any length up to 255.
     *
     * @return array<string, array{int}>
     */
    public static function namesLongerThanTheDocumentedMaximum(): array
    {
        return [
            '31 characters' => [31],
            '25 characters' => [25],
            '21 characters' => [21],
        ];
    }

    #[DataProvider('namesLongerThanTheDocumentedMaximum')]
    public function test_refuses_a_name_longer_than_the_documented_maximum(int $length): void
    {
        $user = User::factory()->create(['first_name' => 'Ada', 'last_name' => 'Lovelace']);

        // CA: packages/client-area/src/views/Account.vue:512 (`Api.put('/user/edit', this.formValue)`)
        // CA reads: packages/client-area/src/views/Account.vue:522 (the CA's name rules and error text)
        $this->actingAs($user)
            ->putJson('/api/user/edit', [
                'first_name' => str_repeat('a', $length),
                'last_name' => 'Lovelace',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['first_name']);

        // CA: packages/client-area/src/views/Account.vue:512 (`Api.put('/user/edit', this.formValue)`)
        // CA reads: packages/client-area/src/views/Account.vue:522 (the CA's name rules and error text)
        $this->actingAs($user)
            ->putJson('/api/user/edit', [
                'first_name' => 'Ada',
                'last_name' => str_repeat('b', $length),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['last_name']);

        $user->refresh();
        $this->assertSame('Ada', $user->first_name);
        $this->assertSame('Lovelace', $user->last_name);
    }

    public function test_refuses_empty_or_missing_names(): void
    {
        $user = User::factory()->create(['first_name' => 'Ada', 'last_name' => 'Lovelace']);

        // CA: packages/client-area/src/views/Account.vue:512 (`Api.put('/user/edit', this.formValue)`)
        // CA reads: packages/client-area/src/views/Account.vue:522 (the CA's name rules)
        $this->actingAs($user)
            ->putJson('/api/user/edit', ['first_name' => '', 'last_name' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['first_name', 'last_name']);

        // CA: packages/client-area/src/views/Account.vue:512 (`Api.put('/user/edit', this.formValue)`)
        // CA reads: packages/client-area/src/views/Account.vue:522 (the CA's name rules)
        $this->actingAs($user)
            ->putJson('/api/user/edit', ['company_name' => 'Example'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['first_name', 'last_name']);

        $user->refresh();
        $this->assertSame('Ada', $user->first_name);
        $this->assertSame('Lovelace', $user->last_name);
    }

    public function test_accepts_the_documented_maximum_name_length(): void
    {
        $user = User::factory()->create(['first_name' => 'Ada', 'last_name' => 'Lovelace']);

        // CA: packages/client-area/src/views/Account.vue:512 (`Api.put('/user/edit', this.formValue)`)
        $this->actingAs($user)
            ->putJson('/api/user/edit', [
                'first_name' => str_repeat('a', 20),
                'last_name' => str_repeat('b', 20),
            ])
            ->assertOk();

        $user->refresh();
        $this->assertSame(str_repeat('a', 20), $user->first_name);
        $this->assertSame(str_repeat('b', 20), $user->last_name);
    }

    public function test_rejects_an_unknown_device_detection_or_language(): void
    {
        $user = User::factory()->create();

        // Old enum values only.
        // CA: packages/client-area/src/views/Account.vue:512 (`Api.put('/user/edit', this.formValue)`)
        // CA reads: packages/client-area/src/views/Account.vue:522 (the CA surfaces `error.response.data.message`)
        $this->actingAs($user)
            ->putJson('/api/user/edit', ['new_device_detection' => 'always'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['new_device_detection']);

        // CA: packages/client-area/src/views/Account.vue:512 (`Api.put('/user/edit', this.formValue)`)
        // CA reads: packages/client-area/src/views/Account.vue:522 (the CA surfaces `error.response.data.message`)
        $this->actingAs($user)
            ->putJson('/api/user/edit', ['language' => 'klingon'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['language']);
    }

    public function test_email_is_stored_lower_cased(): void
    {
        $user = User::factory()->create(['email' => 'old@example.com', 'password' => 'password123']);

        // CA: packages/client-area/src/mixins/ChangeEmailAddressMixin.js:38 (`Api.put('/user/edit/email', formData)`)
        $this->actingAs($user)
            ->putJson('/api/user/edit/email', ['email' => 'New@Example.com', 'password' => 'password123'])
            ->assertOk();

        $this->assertSame('new@example.com', $user->fresh()->email);
    }

    public function test_email_uniqueness_is_case_insensitive(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);
        $user = User::factory()->create(['email' => 'mine@example.com', 'password' => 'password123']);

        // CA: packages/client-area/src/mixins/ChangeEmailAddressMixin.js:38 (`Api.put('/user/edit/email', formData)`)
        // CA reads: packages/client-area/src/mixins/ChangeEmailAddressMixin.js:50 (the CA shows `errors.email[0]`)
        $this->actingAs($user)
            ->putJson('/api/user/edit/email', ['email' => 'TAKEN@example.com', 'password' => 'password123'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_accepts_the_address_the_account_already_has(): void
    {
        $user = User::factory()->create(['email' => 'mine@example.com', 'password' => 'password123']);

        // CA: packages/client-area/src/mixins/ChangeEmailAddressMixin.js:38 (`Api.put('/user/edit/email', formData)`)
        // CA reads: packages/client-area/src/mixins/ChangeEmailAddressMixin.js:38 (the old body's `success` key)
        $this->actingAs($user)
            ->putJson('/api/user/edit/email', ['email' => 'mine@example.com', 'password' => 'password123'])
            ->assertOk()
            ->assertJson(['success' => true]);

        // CA: packages/client-area/src/mixins/ChangeEmailAddressMixin.js:38 (`Api.put('/user/edit/email', formData)`)
        $this->actingAs($user)
            ->putJson('/api/user/edit/email', ['email' => 'MINE@example.com', 'password' => 'password123'])
            ->assertOk();

        $this->assertSame('mine@example.com', $user->fresh()->email);
    }

    public function test_updates_email_after_password_confirmation(): void
    {
        $user = User::factory()->create(['email' => 'old@example.com', 'password' => 'password123']);

        // CA: packages/client-area/src/mixins/ChangeEmailAddressMixin.js:38 (`Api.put('/user/edit/email', formData)`)
        // CA reads: packages/client-area/src/mixins/ChangeEmailAddressMixin.js:38 (the old body's `success` key)
        $this->actingAs($user)
            ->putJson('/api/user/edit/email', ['email' => 'new@example.com', 'password' => 'password123'])
            ->assertOk()
            ->assertJson(['success' => true]);

        $this->assertSame('new@example.com', $user->fresh()->email);
    }

    public function test_rejects_email_change_with_wrong_password(): void
    {
        $user = User::factory()->create(['email' => 'old@example.com', 'password' => 'password123']);

        // CA: packages/client-area/src/mixins/ChangeEmailAddressMixin.js:38 (`Api.put('/user/edit/email', formData)`)
        // CA reads: packages/client-area/src/mixins/ChangeEmailAddressMixin.js:52 (the CA surfaces `error.response.data.message`)
        $this->actingAs($user)
            ->putJson('/api/user/edit/email', ['email' => 'new@example.com', 'password' => 'wrong-password'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');

        $this->assertSame('old@example.com', $user->fresh()->email);
    }

    public function test_sets_language_and_dark_mode(): void
    {
        $user = User::factory()->create();

        // CA: packages/client-area/src/components/LanguageSwitcher.vue:161 (`Api.put('/user/language', {language})`)
        $this->actingAs($user)
            ->putJson('/api/user/language', ['language' => 'en'])
            ->assertOk();
        $this->assertSame('en', $user->fresh()->language);

        // CA: packages/client-area/src/components/navbar/UserInfoDropdown.vue:265 (`Api.put('/user/dark-mode', {dark_mode})`)
        $this->actingAs($user)
            ->putJson('/api/user/dark-mode', ['dark_mode' => true])
            ->assertOk();
        $this->assertTrue($user->fresh()->dark_mode);
    }

    public function test_account_endpoints_require_authentication(): void
    {
        // CA: packages/client-area/src/views/Account.vue:512
        $this->putJson('/api/user/edit', ['first_name' => 'Ada'])->assertUnauthorized();
        // CA: packages/client-area/src/components/navbar/UserInfoDropdown.vue:265
        $this->putJson('/api/user/dark-mode', ['dark_mode' => true])->assertUnauthorized();
    }
}
