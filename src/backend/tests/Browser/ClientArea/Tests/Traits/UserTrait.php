<?php

namespace Tests\Browser\ClientArea\Tests\Traits;

use App\Models\User;
use Tests\Browser\Helpers\Helper;

trait UserTrait
{
    private function setUser(): User
    {
        return Helper::setTestUser();
    }
}
