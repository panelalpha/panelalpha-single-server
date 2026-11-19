<?php

namespace Tests\Feature\ClientArea\Hosting;

use PanelAlpha\ClientArea\Hosting\EnvFileParser;
use PHPUnit\Framework\TestCase;

/**
 * The .env parser is ported verbatim from the old panel; these
 * tests pin its row shape and its parse/serialise round-trip. The parser
 * (and these tests) moved from client-area-legacy into the controller.
 * @see packages/api/app/Lib/Helpers/EnvFileParser.php (ported verbatim)
 */
class EnvFileParserTest extends TestCase
{
    public function test_parse_keeps_blank_comment_and_variable_rows_in_order(): void
    {
        $rows = EnvFileParser::parse("# head\n\nAPP_KEY=\"abc\"\nexport DB_HOST=db # inline\nweird line\n");

        $this->assertSame(['type' => 'comment', 'text' => '# head'], $rows[0]);
        $this->assertSame(['type' => 'blank'], $rows[1]);
        $this->assertSame(['type' => 'variable', 'key' => 'APP_KEY', 'value' => 'abc'], $rows[2]);
        $this->assertSame(['type' => 'variable', 'key' => 'DB_HOST', 'value' => 'db'], $rows[3]);
        $this->assertSame(['type' => 'comment', 'text' => 'weird line'], $rows[4]);
        // A trailing newline does not add a blank row.
        $this->assertCount(5, $rows);
    }

    public function test_double_quoted_values_unwrap_escapes_and_single_quoted_stay_literal(): void
    {
        $rows = EnvFileParser::parse("A=\"line\\nnext\"\nB='it''s'\n");

        $this->assertSame("line\nnext", $rows[0]['value']);
        $this->assertSame("it''s", $rows[1]['value']);
    }

    public function test_serialise_round_trips_the_rows(): void
    {
        $rows = [
            ['type' => 'comment', 'text' => '# heading'],
            ['type' => 'blank'],
            ['type' => 'variable', 'key' => 'A', 'value' => 'plain'],
            ['type' => 'variable', 'key' => 'B', 'value' => 'has space'],
        ];

        $this->assertSame("# heading\n\nA=plain\nB=\"has space\"\n", EnvFileParser::serialise($rows));
    }
}
