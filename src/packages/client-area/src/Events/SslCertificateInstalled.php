<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\PanelUser;
use PanelAlpha\ClientArea\Http\Presenters\ProjectPresenter;
use PanelAlpha\ClientArea\Models\Application;

/**
 * A domain's certificate changed (installed, issued or removed): the project
 * with its current SSL state, for one user who can see it. The Client Area
 * listens on its private `user.{gravatar_hash}` channel for
 * `SslCertificateInstalled` under Echo's default `App\Events` namespace and
 * refreshes the Security card, the project's details and the domain rows
 * (`shared/realtime/echo-client.ts`).
 *
 * The payload is presented per user (privileges and ownership differ), so one
 * event is dispatched per recipient ({@see self::forEveryone()}).
 */
final class SslCertificateInstalled implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets;

    /**
     * @param  array<string, mixed>  $application  the slim project payload (`ProjectPresenter::presentSlim`)
     */
    public function __construct(
        public readonly string $channel,
        public readonly array $application,
    ) {}

    /**
     * Broadcast the project to every user who can see it.
     */
    public static function forEveryone(Application $application): void
    {
        $presenter = app(ProjectPresenter::class);
        foreach (app(AccessResolver::class)->usersFor($application) as $user) {
            if (! $user instanceof PanelUser) {
                continue;
            }
            self::dispatch($user->receivesBroadcastNotificationsOn(), $presenter->presentSlim($application, $user));
        }
    }

    public function broadcastAs(): string
    {
        return 'App\\Events\\SslCertificateInstalled';
    }

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel($this->channel);
    }

    /**
     * @return array{application: array<string, mixed>}
     */
    public function broadcastWith(): array
    {
        return ['application' => $this->application];
    }
}
