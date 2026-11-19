<?php

namespace PanelAlpha\ClientArea\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use PanelAlpha\ClientArea\Contracts\AccessResolver;
use PanelAlpha\ClientArea\Contracts\PanelUser;
use PanelAlpha\ClientArea\Models\Application;

/**
 * A chunk of a custom-project deploy log, broadcast to everyone who can see the
 * application.
 *
 * The Client Area appends `lines` to the console and uses `base_offset` /
 * `next_offset` to detect gaps; a terminal `status` (no lines) tells it to
 * reconcile once via GET. It subscribes with Echo's default namespace
 * (`App\Events`), so `broadcastAs()` returns that legacy name.
 *
 * The controller's deploy watcher (`WatchDeployJob`) fires it; it was
 * client-area-legacy's with the panel deploy
 * history until then, under the same broadcast name and payload.
 */
final class DeployLogUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  array<int, array<string, mixed>>  $lines
     * @param  array<int, array<string, mixed>>  $stages
     */
    public function __construct(
        public readonly Application $application,
        public readonly string $status,
        public readonly int $baseOffset = 0,
        public readonly array $lines = [],
        public readonly ?int $nextOffset = null,
        public readonly ?string $stage = null,
        public readonly array $stages = [],
    ) {}

    /**
     * The Client Area listens under `App\Events\DeployLogUpdated`.
     */
    public function broadcastAs(): string
    {
        return 'App\\Events\\DeployLogUpdated';
    }

    /**
     * @return list<PrivateChannel>
     */
    public function broadcastOn(): array
    {
        /** @var list<PrivateChannel> $channels */
        $channels = app(AccessResolver::class)
            ->usersFor($this->application)
            ->map(fn (PanelUser $user) => new PrivateChannel($user->receivesBroadcastNotificationsOn()))
            ->values()
            ->all();

        return $channels;
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'application_id' => $this->application->id,
            'status' => $this->status,
            'base_offset' => $this->baseOffset,
            'lines' => $this->lines,
            'next_offset' => $this->nextOffset,
            'stage' => $this->stage,
            'stages' => $this->stages,
        ];
    }
}
