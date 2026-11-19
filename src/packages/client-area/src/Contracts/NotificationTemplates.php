<?php

namespace PanelAlpha\ClientArea\Contracts;

use Illuminate\Contracts\Mail\Mailable;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;

/**
 * Editable notification templates for the notifications the Client Area and
 * the host send to users. The old paid
 * panel rendered them from its `notification_templates`: an application
 * notification's in-app text and its email, each switchable, and the password
 * reset mail. The paid Admin Area binds its template store; Community has none – the
 * controller's default keeps every in-app copy with its own text, sends no
 * application email and leaves the host's password reset mail as it is.
 */
interface NotificationTemplates
{
    /**
     * Whether the notification's in-app copy is kept in the user's bell (the
     * `database` channel and the payload's `enabled`). The broadcast that
     * refreshes the open Client Area is sent either way.
     */
    public function storesInApp(ApplicationNotification $notification): bool;

    /**
     * Whether the notification is mailed to `$notifiable` too.
     */
    public function mails(ApplicationNotification $notification, object $notifiable): bool;

    /**
     * The in-app text (`html_text`) from the template, or null for the
     * notification's own text.
     */
    public function inAppText(ApplicationNotification $notification, object $notifiable): ?string;

    /**
     * The notification's email; asked only when `mails()` said yes.
     */
    public function applicationMail(ApplicationNotification $notification, object $notifiable): Mailable;

    /**
     * The password reset mail from the template, or null for the host's own.
     */
    public function passwordResetMail(object $notifiable, string $url): ?Mailable;
}
