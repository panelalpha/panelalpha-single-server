<?php

namespace PanelAlpha\ClientArea\Support;

use Illuminate\Contracts\Mail\Mailable;
use LogicException;
use PanelAlpha\ClientArea\Contracts\NotificationTemplates;
use PanelAlpha\ClientArea\Notifications\ApplicationNotification;

/**
 * Community has no notification templates: every application notification keeps
 * its in-app copy and its own text and sends no email; the host's password
 * reset mail is its own.
 */
final class NoNotificationTemplates implements NotificationTemplates
{
    public function storesInApp(ApplicationNotification $notification): bool
    {
        return true;
    }

    public function mails(ApplicationNotification $notification, object $notifiable): bool
    {
        return false;
    }

    public function inAppText(ApplicationNotification $notification, object $notifiable): ?string
    {
        return null;
    }

    public function applicationMail(ApplicationNotification $notification, object $notifiable): Mailable
    {
        throw new LogicException('Community sends no application notification email.');
    }

    public function passwordResetMail(object $notifiable, string $url): ?Mailable
    {
        return null;
    }
}
