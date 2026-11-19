<?php

namespace PanelAlpha\ClientArea\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Mail\Mailable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\Log;
use PanelAlpha\ClientArea\Contracts\NotificationTemplates;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\StagingService;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * A Client Area notification about one application.
 *
 * Sent to every user of the application (AccessResolver::usersFor) on the
 * private `user.{gravatar_hash}` channel and, because the CA stores them, in
 * the database channel too. `type` is the exact string the CA switches on
 * (`user.instance.redeploy_finished`, `user.instance.backup.create_finished`…).
 *
 * The base carries the instance payload; notifications about a sub-resource
 * (backup, plugin, theme) pass that under the matching key via $payload and
 * set $includeInstance=false, mirroring the old panel's notification classes.
 *
 * The texts are the `client-area::notifications` lines; the database
 * channel's `type` column holds the CA type string, never this class name.
 */
final class ApplicationNotification extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array<string, mixed>  $payload  extra top-level fields (backup, plugin, theme…)
     */
    public function __construct(
        public readonly Application $application,
        public readonly string $type,
        public readonly array $payload = [],
        public readonly bool $isError = false,
        public readonly bool $includeInstance = true,
    ) {}

    /**
     * The queue cannot restore an Eloquent model that has no row: a lost staging
     * is presented from an **unsaved** model, so keep its
     * attributes instead of the ModelIdentifier the base trait would build.
     *
     * @return array<string, mixed>
     */
    public function __serialize(): array
    {
        $values = parent::__serialize();

        if (! $this->application->exists) {
            $values['application'] = $this->application;
        }

        return Payload::object($values);
    }

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        // `broadcast` reaches the open tab, `database` fills the CA bell. The
        // paid edition's templates can switch the bell copy off and add an
        // email (old panel: `broadcast` always, `mail` and `database` when
        // their templates are on).
        $templates = app(NotificationTemplates::class);
        $channels = ['broadcast'];
        if ($templates->storesInApp($this)) {
            $channels[] = 'database';
        }
        if ($templates->mails($this, $notifiable)) {
            $channels[] = 'mail';
        }

        return $channels;
    }

    /**
     * The email of the paid edition's template (never asked in Community).
     */
    public function toMail(object $notifiable): Mailable
    {
        return app(NotificationTemplates::class)->applicationMail($this, $notifiable);
    }

    public function broadcastType(): string
    {
        return $this->type;
    }

    /**
     * The database channel's `type` column: the CA type, not the class name.
     */
    public function databaseType(object $notifiable): string
    {
        return $this->type;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(?object $notifiable = null): array
    {
        $templates = app(NotificationTemplates::class);
        $data = [
            'type' => $this->type,
            'is_error' => $this->isError,
            'enabled' => $templates->storesInApp($this),
            'html_text' => ($notifiable !== null ? $templates->inAppText($this, $notifiable) : null) ?? $this->htmlText(),
        ];

        if ($this->includeInstance && $notifiable instanceof Authenticatable) {
            $data['instance'] = app(ProjectPresenter::class)->present($this->application, $notifiable);
        }

        return array_merge($data, $this->payload);
    }

    /**
     * The websocket copy of the payload.
     *
     * The database channel stores the full instance through `toArray`, but
     * Pusher/Reverb drop a payload over ~10 KB, so the broadcast carries the
     * reduced instance. The CA's Echo handlers read
     * `id`/`staging`/`version`/`server_account_id` and rebuild the row from the
     * returned object.
     *
     * @return array<string, mixed>
     */
    public function toBroadcast(object $notifiable): array
    {
        $data = $this->toArray($notifiable);

        if (array_key_exists('instance', $data) && $notifiable instanceof Authenticatable) {
            $data['instance'] = app(ProjectPresenter::class)->presentSlim($this->application, $notifiable);
        }

        return $data;
    }

    /**
     * The Client Area shows `html_text` (v-html) and falls back to the raw type.
     * The text comes from the package translations with the project name; a
     * failure's Engine message is appended, escaped because the CA renders it as
     * HTML.
     */
    private function htmlText(): string
    {
        $key = 'client-area::notifications.'.$this->type;
        // The CA renders html_text with v-html, so the project name is user
        // input and every placeholder is escaped, as the old Blade `{{ }}` did
        //Lang::get keeps the translation group's `array` return
        // in the type, so the non-string guard below is analyzable.
        $text = Lang::get($key, ['name' => e($this->projectName())]);

        // Should not happen: the guard test lists every type. Log it and fall
        // back to the raw type key – the CA renders that – never to a humanised
        // string built from it.
        if (! is_string($text) || $text === $key) {
            Log::warning('Missing notification translation.', ['key' => $key, 'type' => $this->type]);
            $text = $this->type;
        }

        $message = Payload::nullableString($this->payload['message'] ?? null);
        if ($message !== null && $message !== '') {
            $text .= ' '.e($message);
        }

        return $text;
    }

    /**
     * The project name the CA expects in the text; the username is the fallback
     * for a mirror row the Engine has not named yet.
     */
    private function projectName(): string
    {
        $name = $this->application->exists
            ? StagingService::displayName($this->application)
            : (string) ($this->application->name ?? '');

        return $name !== '' ? $name : (string) $this->application->engine_username;
    }
}
