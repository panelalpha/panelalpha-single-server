<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Notifications\ResetPassword;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\TwoFactorAuthenticatable;
use PanelAlpha\ClientArea\Contracts\PanelUser;

#[Fillable(['name', 'first_name', 'last_name', 'company_name', 'email', 'password', 'language', 'dark_mode', 'new_device_detection'])]
#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes', 'social_auth'])]
class User extends Authenticatable implements PanelUser
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, TwoFactorAuthenticatable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'dark_mode' => 'boolean',
            'password_change_required' => 'boolean',
            'password_generated' => 'boolean',
            'two_factor_confirmed_at' => 'datetime',
            'social_auth' => 'array',
        ];
    }

    /**
     * Send the password reset mail with the Client Area reset URL (the old
     * panel's ResetPassword notification), not Fortify's default web route.
     */
    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPassword($token));
    }

    public function gravatarHash(): string
    {
        return md5(strtolower(trim($this->email)));
    }

    /**
     * Private channel the Client Area listens on: the CA
     * subscribes to `private-user.{gravatar_hash}` for notifications and events.
     */
    public function receivesBroadcastNotificationsOn(): string
    {
        return 'user.'.$this->gravatarHash();
    }
}
