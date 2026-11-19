<?php

namespace App\Console\Commands;

use App\Actions\Users\CreateUser;
use Illuminate\Console\Command;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Support\Payload;

class UsersCreateCommand extends Command
{
    protected $signature = 'users:create
                            {email : Account email}
                            {password? : Plain password (omit to be prompted; avoids shell escaping)}';

    protected $description = 'Create a user account';

    public function handle(CreateUser $createUser): int
    {
        $email = strtolower(trim(Payload::string($this->argument('email'))));
        $password = $this->argument('password');

        if ($password === null || $password === '') {
            $password = Payload::string($this->secret('Password'));
            $confirm = Payload::string($this->secret('Confirm password'));
            if ($password !== $confirm) {
                $this->error('Passwords do not match.');

                return self::FAILURE;
            }
        }

        try {
            $user = $createUser->create($email, Payload::string($password), null);
        } catch (ValidationException $e) {
            foreach ($e->validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $this->info("User created: {$user->email} (id={$user->id})");
        $this->comment('Log in with this exact email. Prefer omitting the password argument so the shell cannot mangle special characters.');

        return self::SUCCESS;
    }
}
