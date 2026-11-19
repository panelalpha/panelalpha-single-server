<?php

namespace Tests\Feature\Community;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Contracts\PanelLanguages;
use PanelAlpha\ClientArea\Contracts\FirstUserCreator;
use PanelAlpha\ClientArea\Contracts\PanelSettings;
use PanelAlpha\ClientArea\Contracts\SetupState;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The host side of the first-run wizard's three contracts.
 */
class HostContractsTest extends TestCase
{
    use EngineFixtures;
    use RefreshDatabase;

    public function test_first_user_creator_lowercases_email_and_defaults_name(): void
    {
        $user = app(FirstUserCreator::class)->create('  Demo.User@Example.COM ', 'Valid-Password1!', null);

        $this->assertInstanceOf(User::class, $user);
        $this->assertSame('demo.user@example.com', $user->email);
        $this->assertSame('demo.user', $user->name);
        $this->assertNotNull($user->email_verified_at);
    }

    public function test_first_user_creator_keeps_a_given_name(): void
    {
        $user = app(FirstUserCreator::class)->create('a@example.com', 'Valid-Password1!', 'Ada');

        $this->assertSame('Ada', $user->name);
        $this->assertSame('Ada', $user->first_name);
        $this->assertNull($user->last_name);
    }

    public function test_first_user_creator_splits_a_full_name_into_first_and_last_name(): void
    {
        $user = app(FirstUserCreator::class)->createWithGeneratedPassword('a@example.com', '  Jan  Maria Kowalski ');

        $this->assertSame('Jan Maria Kowalski', $user->name);
        $this->assertSame('Jan', $user->first_name);
        $this->assertSame('Maria Kowalski', $user->last_name);
    }

    public function test_first_user_creator_leaves_first_and_last_name_empty_without_a_name(): void
    {
        $user = app(FirstUserCreator::class)->create('demo.user@example.com', 'Valid-Password1!', null);

        $this->assertNull($user->first_name);
        $this->assertNull($user->last_name);
    }

    public function test_first_user_creator_rejects_a_weak_password(): void
    {
        try {
            app(FirstUserCreator::class)->create('a@example.com', 'weak', null);
            $this->fail('Expected a ValidationException.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('password', $e->errors());
        }
        $this->assertDatabaseCount('users', 0);
    }

    public function test_first_user_creator_creates_a_user_with_a_generated_password(): void
    {
        $user = app(FirstUserCreator::class)->createWithGeneratedPassword('  Demo.User@Example.COM ');

        $this->assertInstanceOf(User::class, $user);
        $this->assertSame('demo.user@example.com', $user->email);
        $this->assertSame('demo.user', $user->name);
        $this->assertNotNull($user->email_verified_at);
        $this->assertTrue($user->password_generated);
        $this->assertNotSame('', $user->password);
        $this->assertSame('Ada', app(FirstUserCreator::class)->createWithGeneratedPassword('b@example.com', 'Ada')->name);
    }

    public function test_first_user_creator_generated_password_rejects_a_duplicate_email(): void
    {
        app(FirstUserCreator::class)->createWithGeneratedPassword('a@example.com');

        try {
            app(FirstUserCreator::class)->createWithGeneratedPassword('A@Example.com');
            $this->fail('Expected a ValidationException.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('email', $e->errors());
        }
        $this->assertDatabaseCount('users', 1);
    }

    public function test_first_user_creator_rejects_a_duplicate_email(): void
    {
        app(FirstUserCreator::class)->create('a@example.com', 'Valid-Password1!', null);

        try {
            app(FirstUserCreator::class)->create('A@Example.com', 'Valid-Password1!', null);
            $this->fail('Expected a ValidationException.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('email', $e->errors());
        }
        $this->assertDatabaseCount('users', 1);
    }

    public function test_panel_settings_set_and_forget_are_visible_in_the_same_request(): void
    {
        $settings = app(PanelSettings::class);

        $this->assertNull($settings->get('wizard-x'));
        $this->assertSame('fallback', $settings->get('wizard-x', 'fallback'));

        $settings->set('wizard-x', 'one');
        $this->assertSame('one', $settings->get('wizard-x'));
        $settings->set('wizard-x', 'two');
        $this->assertSame('two', $settings->get('wizard-x'));

        $settings->set('wizard-y', 'y');
        $settings->forget('wizard-x', 'wizard-y');
        $this->assertSame('fallback', $settings->get('wizard-x', 'fallback'));
        $this->assertNull($settings->get('wizard-y'));
        $this->assertDatabaseMissing('settings', ['name' => 'wizard-x']);
    }

    public function test_setup_is_required_only_with_zero_users(): void
    {
        $this->assertTrue(app(SetupState::class)->required());

        User::factory()->create();

        $this->assertFalse(app(SetupState::class)->required());
    }

    public function test_setup_is_not_required_outside_single_user_mode(): void
    {
        $this->bindMultiUserEdition([]);

        $this->assertFalse(app(SetupState::class)->required());
        $this->assertFalse(app(SetupState::class)->blocked());
    }

    public function test_a_failed_first_user_creation_blocks_the_wizard_until_an_account_exists(): void
    {
        // The marker the entrypoint writes when `users:create` refused the variables.
        $marker = storage_path('framework/testing/first-user-failed-'.bin2hex(random_bytes(4)));
        config(['community.first_user_failed_marker' => $marker]);
        file_put_contents($marker, '');

        try {
            $this->assertTrue(app(SetupState::class)->blocked());
            $this->assertFalse(app(SetupState::class)->required());

            // The operator's account ends the block, even while the marker is still on disk.
            User::factory()->create();

            $this->assertFalse(app(SetupState::class)->blocked());
            $this->assertFalse(app(SetupState::class)->required());
        } finally {
            @unlink($marker);
        }
    }

    public function test_available_languages_are_the_host_language_folders(): void
    {
        $this->assertSame(['en'], app(PanelLanguages::class)->codes());
    }
}
