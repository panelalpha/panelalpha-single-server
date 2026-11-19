<?php

namespace Tests\Feature\Auth;

use App\Http\Responses\PasswordResetRefusedResponse;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\SendQueuedNotifications;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The password reset routes: forgot-password, reset-password.
 * @see packages/api/routes/api.php:766,770 (old forgot/reset routes)
 */
class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_forgot_password_sends_the_client_area_reset_mail(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'user@example.com']);

        // CA: packages/client-area/src/views/ForgotPassword.vue:133 (`Api.post('/forgot-password', {email})`)
        // CA reads: packages/client-area/src/views/ForgotPassword.vue:137 (`response.data.message`)
        $this->postJson('/api/forgot-password', ['email' => 'user@example.com'])
            ->assertOk()
            ->assertJsonStructure(['message']);

        Notification::assertSentTo($user, ResetPassword::class);
    }

    public function test_the_community_reset_mail_links_to_the_client_area_reset_screen(): void
    {
        config(['app.url' => 'https://panel.example.com/']);
        $user = User::factory()->create(['email' => 'user@example.com']);

        // Community has no notification templates (`NoNotificationTemplates`): Laravel's text, the CA link.
        $mail = (new ResetPassword('secret-token'))->toMail($user);

        $this->assertInstanceOf(MailMessage::class, $mail);
        $this->assertSame('Reset your password', $mail->subject);
        $this->assertSame('https://panel.example.com/password-reset/change?token=secret-token&email=user%40example.com', $mail->actionUrl);
    }

    public function test_reset_mail_link_uses_the_stored_panel_url_or_app_url(): void
    {
        config(['app.url' => 'https://panel.example.test']);
        $user = User::factory()->create(['email' => 'user@example.com']);
        $notification = new ResetPassword('tok');

        $this->assertStringStartsWith(
            'https://panel.example.test/password-reset/change?token=tok',
            (string) $notification->toMail($user)->actionUrl,
        );

        Setting::set('userapp.url', 'https://new.example.com:8443');

        $this->assertStringStartsWith(
            'https://new.example.com:8443/password-reset/change?token=tok',
            (string) $notification->toMail($user)->actionUrl,
        );
    }

    public function test_forgot_password_while_logged_in_answers_json_without_a_redirect(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'user@example.com']);

        // An open session must not get the old `guest` 302 redirect.
        $this->actingAs($user)
// CA: packages/client-area/src/views/ForgotPassword.vue:133 (`Api.post('/forgot-password', {email})`)
            ->postJson('/api/forgot-password', ['email' => 'user@example.com'])
            ->assertOk()
// CA reads: packages/client-area/src/views/ForgotPassword.vue:137 (`response.data.message`)
            ->assertJsonStructure(['message']);

        // No reset link is mailed for an already authenticated session.
        Notification::assertNothingSent();
    }

    public function test_forgot_password_is_rate_limited(): void
    {
        Notification::fake();
        User::factory()->create(['email' => 'user@example.com']);

        for ($attempt = 0; $attempt < 6; $attempt++) {
            // CA: packages/client-area/src/views/ForgotPassword.vue:133
            $this->postJson('/api/forgot-password', ['email' => 'user@example.com']);
        }

        // throttle:6,1 per IP.
        // CA: packages/client-area/src/views/ForgotPassword.vue:133
        $this->postJson('/api/forgot-password', ['email' => 'user@example.com'])
            ->assertStatus(429);
    }

    public function test_forgot_password_answers_a_known_and_an_unknown_email_the_same(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'user@example.com']);

        // CA: packages/client-area/src/views/ForgotPassword.vue:133 (`Api.post('/forgot-password', {email})`)
        $known = $this->postJson('/api/forgot-password', ['email' => 'user@example.com'])->assertOk();
        // CA: packages/client-area/src/views/ForgotPassword.vue:133 (`Api.post('/forgot-password', {email})`)
        $unknown = $this->postJson('/api/forgot-password', ['email' => 'nobody@example.com'])->assertOk();

        // The form must not answer whether an account exists: same status and the same body.
        $this->assertSame($known->json(), $unknown->json());
        // CA reads: packages/client-area/src/views/ForgotPassword.vue:137 (`response.data.message`)
        $known->assertJsonPath('message', 'If an account exists for that e-mail address, we have sent it a link to reset the password.');

        // Only the address that has an account is mailed.
        Notification::assertSentToTimes($user, ResetPassword::class, 1);
    }

    public function test_forgot_password_answers_a_throttled_email_the_same(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'user@example.com']);

        // CA: packages/client-area/src/views/ForgotPassword.vue:133 (`Api.post('/forgot-password', {email})`)
        $first = $this->postJson('/api/forgot-password', ['email' => 'user@example.com'])->assertOk();
        // The broker's 60 s throttle keeps the second link back; the answer must not show it.
        // CA: packages/client-area/src/views/ForgotPassword.vue:133 (`Api.post('/forgot-password', {email})`)
        $second = $this->postJson('/api/forgot-password', ['email' => 'user@example.com'])->assertOk();

        $this->assertSame($first->json(), $second->json());
        Notification::assertSentToTimes($user, ResetPassword::class, 1);
    }

    public function test_forgot_password_refuses_a_malformed_email(): void
    {
        Notification::fake();

        // CA: packages/client-area/src/views/ForgotPassword.vue:133 (`Api.post('/forgot-password', {email})`)
        // CA reads: packages/client-area/src/views/ForgotPassword.vue:144 (`error.response.data.errors.email[0]`)
        $this->postJson('/api/forgot-password', ['email' => 'not-an-email'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');

        Notification::assertNothingSent();
    }

    public function test_the_reset_mail_leaves_the_request_on_the_queue(): void
    {
        Queue::fake();
        Mail::fake();
        User::factory()->create(['email' => 'user@example.com']);

        // CA: packages/client-area/src/views/ForgotPassword.vue:133 (`Api.post('/forgot-password', {email})`)
        $this->postJson('/api/forgot-password', ['email' => 'user@example.com'])
            ->assertOk()
            // CA reads: packages/client-area/src/views/ForgotPassword.vue:137 (`response.data.message`)
            ->assertJsonPath('message', 'If an account exists for that e-mail address, we have sent it a link to reset the password.');

        // The request queues the mail; the panel's worker sends it.
        Queue::assertPushed(
            SendQueuedNotifications::class,
            fn (SendQueuedNotifications $job): bool => $job->notification instanceof ResetPassword,
        );
        Mail::assertNothingSent();
    }

    public function test_a_refused_mail_message_does_not_change_the_answer(): void
    {
        config([
            'queue.default' => 'database',
            // A relay on a closed port: handing the message over fails.
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => 'localhost',
            'mail.mailers.smtp.port' => 1,
            'mail.mailers.smtp.timeout' => 1,
        ]);
        User::factory()->create(['email' => 'user@example.com']);

        // CA: packages/client-area/src/views/ForgotPassword.vue:133 (`Api.post('/forgot-password', {email})`)
        $known = $this->postJson('/api/forgot-password', ['email' => 'user@example.com'])->assertOk();
        // CA: packages/client-area/src/views/ForgotPassword.vue:133 (`Api.post('/forgot-password', {email})`)
        $unknown = $this->postJson('/api/forgot-password', ['email' => 'nobody@example.com'])->assertOk();

        $this->assertSame($known->json(), $unknown->json());
        // Only the known address queued work, and no mail left the request.
        $this->assertDatabaseCount('jobs', 1);
        $this->assertDatabaseCount('failed_jobs', 0);

        // The worker takes the job; its mailer refuses the message and the job
        // is recorded as failed there, after the visitor had the answer.
        $this->artisan('queue:work', [
            'connection' => 'database',
            '--queue' => 'default',
            '--once' => true,
            '--tries' => 1,
        ])->assertSuccessful();

        $this->assertDatabaseCount('jobs', 0);
        $this->assertDatabaseCount('failed_jobs', 1);
    }

    public function test_reset_password_changes_the_password(): void
    {
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'old-password',
        ]);

        // The broker stores a hash; createToken returns the plaintext for the link.
        $token = Password::broker()->createToken($user);

        // CA: packages/client-area/src/views/ResetPassword.vue:109 (`Api.post('/reset-password', {token, email, password, password_confirmation})`)
        // CA reads: packages/client-area/src/views/ResetPassword.vue:118 (`response.data.message`)
        $this->postJson('/api/reset-password', [
            'token' => $token,
            'email' => 'user@example.com',
            'password' => 'New-Password1!',
            'password_confirmation' => 'New-Password1!',
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Your password has been reset.');

        $this->assertTrue(Hash::check('New-Password1!', $user->fresh()->password));
    }

    public function test_reset_password_clears_the_generated_password_flag(): void
    {
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'password_generated' => true,
        ]);
        $token = Password::broker()->createToken($user);

        // CA: packages/client-area/src/views/ResetPassword.vue:109 (`Api.post('/reset-password', {token, email, password, password_confirmation})`)
        $this->postJson('/api/reset-password', [
            'token' => $token,
            'email' => 'user@example.com',
            'password' => 'New-Password1!',
            'password_confirmation' => 'New-Password1!',
        ])->assertOk();

        $this->assertFalse($user->fresh()->password_generated);
    }

    public function test_reset_password_answers_a_known_and_an_unknown_email_the_same(): void
    {
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'password' => 'old-password',
        ]);
        $attempt = [
            'token' => 'not-a-real-token',
            'password' => 'New-Password1!',
            'password_confirmation' => 'New-Password1!',
        ];

        // CA: packages/client-area/src/views/ResetPassword.vue:109 (`Api.post('/reset-password', {token, email, password, password_confirmation})`)
        $known = $this->postJson('/api/reset-password', ['email' => 'user@example.com'] + $attempt);
        // CA: packages/client-area/src/views/ResetPassword.vue:109 (`Api.post('/reset-password', {token, email, password, password_confirmation})`)
        $unknown = $this->postJson('/api/reset-password', ['email' => 'nobody@example.com'] + $attempt);

        $known->assertStatus(422);
        $unknown->assertStatus(422);
        $this->assertSame($known->json(), $unknown->json());
        // CA reads: packages/client-area/src/views/ResetPassword.vue:118 (`response.data.errors.email[0]`)
        $known->assertJsonPath('errors.email.0', PasswordResetRefusedResponse::MESSAGE);
        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    public function test_a_refused_reset_answers_json_without_an_accept_header(): void
    {
        User::factory()->create(['email' => 'user@example.com']);

        // An API client's XHR without Accept.
        $response = $this->withHeader('X-Requested-With', 'XMLHttpRequest')
            // CA: packages/client-area/src/views/ResetPassword.vue:109 (`Api.post('/reset-password', {token, email, password, password_confirmation})`)
            ->post('/api/reset-password', [
                'token' => 'not-a-real-token',
                'email' => 'user@example.com',
                'password' => 'New-Password1!',
                'password_confirmation' => 'New-Password1!',
            ]);

        $response->assertStatus(422);
        $response->assertHeader('Content-Type', 'application/json');
        // CA reads: packages/client-area/src/views/ResetPassword.vue:118 (`response.data.message`)
        $response->assertJsonPath('message', PasswordResetRefusedResponse::MESSAGE);
        // CA reads: packages/client-area/src/views/ResetPassword.vue:118 (`response.data.errors.email[0]`)
        $response->assertJsonPath('errors.email.0', PasswordResetRefusedResponse::MESSAGE);
    }

    public function test_a_refused_reset_answers_the_same_json_to_every_accept(): void
    {
        User::factory()->create(['email' => 'user@example.com']);
        $attempt = [
            'token' => 'not-a-real-token',
            'email' => 'user@example.com',
            'password' => 'New-Password1!',
            'password_confirmation' => 'New-Password1!',
        ];

        $bodies = [];
        foreach (['*/*', 'text/html', 'application/json'] as $accept) {
            // CA: packages/client-area/src/views/ResetPassword.vue:109 (`Api.post('/reset-password', {token, email, password, password_confirmation})`)
            $response = $this->withHeaders([
                'X-Requested-With' => 'XMLHttpRequest',
                'Accept' => $accept,
            ])->post('/api/reset-password', $attempt);

            $response->assertStatus(422);
            $response->assertHeader('Content-Type', 'application/json');
            $bodies[$accept] = $response->json();
            // CA reads: packages/client-area/src/views/ResetPassword.vue:118 (`response.data.errors.email[0]`)
            $response->assertJsonPath('errors.email.0', PasswordResetRefusedResponse::MESSAGE);
        }

        $this->assertSame($bodies['application/json'], $bodies['*/*']);
        $this->assertSame($bodies['application/json'], $bodies['text/html']);
    }
}
