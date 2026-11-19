<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class UsersListCommand extends Command
{
    protected $signature = 'users:list';

    protected $description = 'List user accounts';

    public function handle(): int
    {
        $users = User::query()
            ->orderBy('id')
            ->get(['id', 'name', 'email', 'created_at']);

        if ($users->isEmpty()) {
            $this->info('No users.');

            return self::SUCCESS;
        }

        $this->table(
            ['ID', 'Name', 'Email', 'Created'],
            $users->map(fn (User $user) => [
                $user->id,
                $user->name,
                $user->email,
                $user->created_at === null ? null : Carbon::parse($user->created_at)->toDateTimeString(),
            ])->all(),
        );

        return self::SUCCESS;
    }
}
