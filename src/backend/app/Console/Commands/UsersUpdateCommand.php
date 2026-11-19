<?php

namespace App\Console\Commands;

use App\Actions\Fortify\PasswordValidationRules;
use App\Models\User;
use Illuminate\Console\Command;
use PanelAlpha\ClientArea\Support\Payload;
use Illuminate\Support\Facades\Validator;

class UsersUpdateCommand extends Command
{
    use PasswordValidationRules;

    protected $signature = 'users:update
                            {email : Current account email}
                            {--email= : New email address}
                            {--password= : New plain password}';

    protected $description = 'Update a user account email and/or password';

    public function handle(): int
    {
        $currentEmail = strtolower(trim(Payload::string($this->argument('email'))));
        $newEmail = $this->option('email');
        $password = $this->option('password');

        if (($newEmail === null || $newEmail === '') && ($password === null || $password === '')) {
            $this->line($this->getSynopsis());
            $this->newLine();
            $this->comment('Examples:');
            $this->line('  php artisan users:update user@example.com --email=new@example.com');
            $this->line('  php artisan users:update user@example.com --password=secret123');
            $this->line('  php artisan users:update user@example.com --email=new@example.com --password=secret123');

            return self::SUCCESS;
        }

        $user = User::query()->whereRaw('LOWER(email) = ?', [$currentEmail])->first();
        if (! $user) {
            $this->error("User not found: {$currentEmail}");

            return self::FAILURE;
        }

        $data = [];
        if ($newEmail !== null && $newEmail !== '') {
            $data['email'] = strtolower(trim(Payload::string($newEmail)));
        }
        if ($password !== null && $password !== '') {
            $data['password'] = Payload::string($password);
        }

        $rules = [];
        if (array_key_exists('email', $data)) {
            $rules['email'] = ['required', 'email', 'max:255', 'unique:users,email,'.$user->id];
        }
        if (array_key_exists('password', $data)) {
            $rules['password'] = $this->passwordPolicy();
        }

        $validator = Validator::make($data, $rules);
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        if (array_key_exists('email', $data)) {
            $user->email = $data['email'];
            if ($user->name === strstr($currentEmail, '@', true) || $user->name === $currentEmail) {
                $local = strstr($data['email'], '@', true);
                $user->name = $local === false || $local === '' ? $data['email'] : $local;
            }
        }
        if (array_key_exists('password', $data)) {
            $user->password = $data['password'];
            $user->password_generated = false;
        }
        $user->save();

        $changes = [];
        if (array_key_exists('email', $data)) {
            $changes[] = "email={$data['email']}";
        }
        if (array_key_exists('password', $data)) {
            $changes[] = 'password=***';
        }

        $this->info('User updated: '.$currentEmail.' ('.implode(', ', $changes).')');

        return self::SUCCESS;
    }
}
