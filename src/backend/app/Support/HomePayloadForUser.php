<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use PanelAlpha\ClientArea\Contracts\ClientAreaHome;

/**
 * The host's `/home` payload for a package that signs a user in and answers
 * `/home`, as the host's `/login` does – the paid sign-up.
 */
final class HomePayloadForUser implements ClientAreaHome
{
    public function __construct(private readonly HomePayload $home) {}

    public function payloadFor(Authenticatable $user): array
    {
        return $this->home->build($user instanceof User ? $user : null);
    }
}
