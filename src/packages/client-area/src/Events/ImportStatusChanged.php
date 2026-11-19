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
 * A WordPress import moved on (Engine 2.2.0): the project with its new
 * `import_details` and `async_status.installation`, for one user who can see
 * it. The Client Area listens on its private `user.{gravatar_hash}` channel
 * for `ImportStatusChanged` under Echo's default `App\Events` namespace and
 * replaces the row and the open details modal with `application`
 * (`apis/Auth.js:469-474`, `views/Instances.vue:417-426`,
 * `components/modal/ImportInstanceDetailsModal.vue:254-265`); the old panel
 * broadcast the same name (`App\Events\ImportStatusChanged`).
 *
 * The payload is presented per user (privileges and ownership differ), so one
 * event is dispatched per recipient ({@see self::forEveryone()}).
 */
final class ImportStatusChanged implements ShouldBroadcast
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
        return 'App\\Events\\ImportStatusChanged';
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
