<?php

namespace App\Notifications;

use Illuminate\Contracts\Auth\CanResetPassword;
use Illuminate\Contracts\Mail\Mailable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Lang;
use PanelAlpha\ClientArea\Contracts\NotificationTemplates;
use PanelAlpha\ClientArea\Contracts\PanelUrl;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Password reset mail whose link points at the Client Area reset screen
 * (`/password-reset/change?token=…&email=…`), as the old panel did. Fortify's
 * default notification links to a web route the SPA does not have. The paid
 * edition renders it from its editable template (old
 * `App\Notifications\User\System\ResetPassword`, `NotificationTemplates`);
 * Community sends Laravel's own reset mail text.
 *
 * Its own notification rather than a subclass of Laravel's `ResetPassword`,
 * whose `toMail()` is documented to return a `MailMessage` only.
 *
 * It leaves on the queue, so the request that asks for a link does the same
 * work whether or not the address has an account, and a mailer that refuses
 * the message fails the worker's job instead of the visitor's request.
 */
class ResetPassword extends Notification implements ShouldQueue
{
    private const string CLIENT_PATH = '/password-reset/change';

    public function __construct(#[\SensitiveParameter] public readonly string $token) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage|Mailable
    {
        $url = $this->resetUrl($notifiable);

        return app(NotificationTemplates::class)->passwordResetMail($notifiable, $url)
            ?? (new MailMessage)
                ->subject(Payload::string(Lang::get('Reset your password')))
                ->line(Payload::string(Lang::get('You are receiving this email because we received a password reset request for your account.')))
                ->action(Payload::string(Lang::get('Reset Password')), $url)
                ->line(Payload::string(Lang::get('This password reset link will expire in :count minutes.', ['count' => Payload::string(config('auth.passwords.'.Payload::string(config('auth.defaults.passwords')).'.expire'))])))
                ->line(Payload::string(Lang::get('If you did not request a password reset, no further action is required.')));
    }

    protected function resetUrl(object $notifiable): string
    {
        $base = app(PanelUrl::class)->base();

        return $base.self::CLIENT_PATH.'?'.http_build_query([
            'token' => $this->token,
            'email' => $notifiable instanceof CanResetPassword
                ? $notifiable->getEmailForPasswordReset()
                : '',
        ]);
    }
}
