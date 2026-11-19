<?php

namespace Tests\Feature\ClientArea\Jobs;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The input checks of `client-area:mcp-adopt-token`: a token id that is not a
 * positive number and an owner that matches no user are refused before any
 * Engine call.
 *
 * Contract: the command fails with a message that names the bad input and
 * never rescopes a token.
 */
class McpAdoptTokenCommandFailuresTest extends TestCase
{
    use JobFixtures, RefreshDatabase;

    /**
     * @return array<string, array{0: string}>
     */
    public static function badTokenIds(): array
    {
        return [
            'letters' => ['abc'],
            'zero' => ['0'],
            'negative' => ['-4'],
            'decimal' => ['1.5'],
        ];
    }

    #[DataProvider('badTokenIds')]
    public function test_a_token_id_that_is_not_a_positive_number_is_refused(string $tokenId): void
    {
        User::factory()->create();
        Http::fake();

        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => $tokenId])
            ->expectsOutputToContain('The Engine MCP token id must be a positive number.')
            ->assertFailed();

        Http::assertNothingSent();
    }

    public function test_an_owner_that_matches_no_user_is_refused(): void
    {
        User::factory()->create();
        Http::fake();

        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => '7', '--user' => '999'])
            ->expectsOutputToContain('No user matches --user=999.')
            ->assertFailed();

        Http::assertNothingSent();
    }

    public function test_an_owner_email_that_matches_no_user_is_refused(): void
    {
        User::factory()->create();
        Http::fake();

        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => '7', '--user' => 'nobody@example.com'])
            ->expectsOutputToContain('No user matches --user=nobody@example.com.')
            ->assertFailed();

        Http::assertNothingSent();
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function unknownEngines(): array
    {
        return [
            'not a number' => ['main'],
            'an Engine this edition does not have' => ['2'],
        ];
    }

    #[DataProvider('unknownEngines')]
    public function test_an_engine_this_edition_does_not_have_is_refused(string $engine): void
    {
        User::factory()->create();
        Http::fake();

        $this->artisan('client-area:mcp-adopt-token', ['engineTokenId' => '7', '--engine' => $engine])
            ->expectsOutputToContain("No Engine matches --engine={$engine}.")
            ->assertFailed();

        Http::assertNothingSent();
    }
}
