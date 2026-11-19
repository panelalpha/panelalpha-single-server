<?php

namespace Tests\Unit;

use Illuminate\Http\Request;
use PanelAlpha\ClientArea\Support\QueryString;
use PHPUnit\Framework\TestCase;

/**
 * The V20 typing pass introduced QueryString so a controller
 * never casts an array query value to string. A missing value and an array both
 * read as `''` – the array is ignored, not answered with a 422 – while a scalar
 * keeps its text.
 */
class QueryStringTest extends TestCase
{
    public function test_a_missing_value_reads_as_empty(): void
    {
        $this->assertSame('', QueryString::from(Request::create('/x', 'GET'), 'domain'));
    }

    public function test_a_string_value_is_returned_unchanged(): void
    {
        $request = Request::create('/x', 'GET', ['domain' => 'example.com']);

        $this->assertSame('example.com', QueryString::from($request, 'domain'));
    }

    public function test_an_array_query_value_is_ignored(): void
    {
        $request = Request::create('/x', 'GET', ['domain' => ['a', 'b']]);

        $this->assertSame('', QueryString::from($request, 'domain'));
    }
}
