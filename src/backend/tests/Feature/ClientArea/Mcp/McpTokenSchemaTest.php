<?php

namespace Tests\Feature\ClientArea\Mcp;

use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use PanelAlpha\ClientArea\Models\McpToken;
use Tests\TestCase;

/**
 * `mcp_tokens` is the controller table that records which user
 * owns each Engine MCP token the panel minted (a natural unique key,
 * the user FK on `client-area.users_table`, cascade).
 * It holds ids and the display name only – never a plain-text token.
 */
final class McpTokenSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_table_keeps_ids_and_the_name_only(): void
    {
        $this->assertSame(
            // `deleted_at`: a deleted token keeps its row for the activity log.
            // `token_digest`: the SHA-256 of the plain-text token, never the token
            // itself – the `/mcp` gatekeeper's tie-break between two Engines'
            // equal token ids.
            ['created_at', 'deleted_at', 'engine_id', 'engine_token_id', 'id', 'name', 'token_digest', 'updated_at', 'user_id'],
            collect(Schema::getColumnListing('mcp_tokens'))->sort()->values()->all(),
        );
    }

    public function test_one_engine_token_has_one_owner(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        McpToken::query()->create(['user_id' => $alice->id, 'engine_id' => 1, 'engine_token_id' => 6, 'name' => 'Claude']);
        // The same token id on another Engine is another token (Multi).
        McpToken::query()->create(['user_id' => $bob->id, 'engine_id' => 2, 'engine_token_id' => 6, 'name' => 'Claude']);

        $this->expectException(UniqueConstraintViolationException::class);
        McpToken::query()->create(['user_id' => $bob->id, 'engine_id' => 1, 'engine_token_id' => 6, 'name' => 'Claude']);
    }

    public function test_a_deleted_user_takes_its_token_rows_along(): void
    {
        $alice = User::factory()->create();
        McpToken::query()->create(['user_id' => $alice->id, 'engine_id' => 1, 'engine_token_id' => 6, 'name' => 'Claude']);

        $alice->delete();

        $this->assertSame(0, McpToken::query()->count());
    }

    public function test_the_user_key_points_at_the_configured_users_table(): void
    {
        $keys = collect(Schema::getForeignKeys('mcp_tokens'))
            ->map(static fn (array $key): string => implode(',', $key['columns']).'->'.$key['foreign_table'].'.'.implode(',', $key['foreign_columns']).' '.strtolower((string) $key['on_delete']))
            ->all();

        $this->assertSame('users', config('client-area.users_table'));
        $this->assertSame(['user_id->users.id cascade'], $keys);
    }
}
