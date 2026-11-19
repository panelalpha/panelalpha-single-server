<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use PanelAlpha\ClientArea\Support\Payload;
use Illuminate\Support\Carbon;

class UsersShowCommand extends Command
{
    protected $signature = 'users:show {email}';

    protected $description = 'Show a user account by email';

    public function handle(): int
    {
        $email = Payload::string($this->argument('email'));
        $user = User::query()->where('email', $email)->first();

        if (! $user) {
            $this->error("User not found: {$email}");

            return self::FAILURE;
        }

        $this->table(
            ['Field', 'Value'],
            [
                ['id', $user->id],
                ['name', $user->name],
                ['email', $user->email],
                ['email_verified_at', $user->email_verified_at === null ? null : Carbon::parse($user->email_verified_at)->toDateTimeString()],
                ['created_at', $user->created_at === null ? null : Carbon::parse($user->created_at)->toDateTimeString()],
                ['updated_at', $user->updated_at === null ? null : Carbon::parse($user->updated_at)->toDateTimeString()],
            ],
        );

        return self::SUCCESS;
    }
}
