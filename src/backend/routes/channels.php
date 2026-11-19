<?php
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Broadcast;

// Only a panel user's own channel; another guard's account (a paid edition's
// admin) is refused instead of failing the typed callback.
Broadcast::channel('user.{gravatar_hash}', function (Authenticatable $user, string $gravatar_hash) {
    return $user instanceof User && $user->gravatarHash() === $gravatar_hash;
});
