<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use PanelAlpha\ClientArea\Support\Payload;

class UsersDeleteCommand extends Command
{
    protected $signature = 'users:delete {email}';

    protected $description = 'Delete a user account by email';

    public function handle(): int
    {
        $email = Payload::string($this->argument('email'));
        $user = User::query()->where('email', $email)->first();

        if (! $user) {
            $this->error("User not found: {$email}");

            return self::FAILURE;
        }

        $user->delete();
        $this->info("User deleted: {$email}");

        return self::SUCCESS;
    }
}
