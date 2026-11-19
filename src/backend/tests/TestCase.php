<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Http;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // No test may touch the network: every Engine/provider call is faked
        //A test that forgets its fake fails with
        // Laravel's own "stray request" exception instead of silently passing.
        Http::preventStrayRequests();
    }
}
