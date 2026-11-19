<?php

namespace Tests\Unit\ClientArea\Hosting;

use PanelAlpha\ClientArea\Hosting\LogWindow;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The paged webserver log view (client-area-next `logs-paged-table`): a page
 * is WINDOW (16384) bytes counted from the file's end (or from the snapshot
 * size page 1 answered), read one byte early and TAIL_EXTRA (8192) bytes late;
 * it keeps the lines whose first byte lies inside the window, in file order,
 * without `\n`, the last one completed within TAIL_EXTRA.
 */
class LogWindowTest extends TestCase
{
    /**
     * The lines of page $page of $file, read the way the service reads them
     * (bytes `readFirst..readLast` of the file).
     *
     * @return list<string>
     */
    private function page(string $file, int $page, ?int $snapshot = null): array
    {
        $window = LogWindow::for(strlen($file), $snapshot, $page);
        $bytes = $window->hasBytes() ? substr($file, $window->readFirst, $window->readLast - $window->readFirst + 1) : '';

        return $window->lines($bytes);
    }

    /**
     * Every page from the oldest to the newest, joined.
     *
     * @return list<string>
     */
    private function allPages(string $file): array
    {
        $pages = LogWindow::for(strlen($file), null, 1)->pages;
        $lines = [];
        for ($page = $pages; $page >= 1; $page--) {
            array_push($lines, ...$this->page($file, $page));
        }

        return $lines;
    }

    public function test_the_window_and_the_tail_extra_are_pinned(): void
    {
        $this->assertSame(16384, LogWindow::WINDOW);
        $this->assertSame(8192, LogWindow::TAIL_EXTRA);
    }

    public function test_page_one_is_the_newest_window_and_reads_one_byte_early(): void
    {
        $window = LogWindow::for(40000, null, 1);

        $this->assertSame(40000, $window->size);
        $this->assertSame(3, $window->pages);
        $this->assertSame(23616, $window->start);
        $this->assertSame(40000, $window->end);
        $this->assertSame(23615, $window->readFirst);
        // Nothing past the file's end.
        $this->assertSame(39999, $window->readLast);
    }

    public function test_a_middle_page_reads_the_tail_extra_past_its_end(): void
    {
        $window = LogWindow::for(40000, null, 2);

        $this->assertSame(7232, $window->start);
        $this->assertSame(23616, $window->end);
        $this->assertSame(7231, $window->readFirst);
        $this->assertSame(23615 + 8192, $window->readLast);
    }

    public function test_the_last_page_starts_at_the_file_start(): void
    {
        $window = LogWindow::for(40000, null, 3);

        $this->assertSame(0, $window->start);
        $this->assertSame(7232, $window->end);
        $this->assertSame(0, $window->readFirst);
        $this->assertSame(7231 + 8192, $window->readLast);
    }

    /**
     * @return array<string, array{int, int}>
     */
    public static function pageCounts(): array
    {
        return [
            'empty file' => [0, 1],
            'one byte' => [1, 1],
            'exactly one window' => [16384, 1],
            'one byte over a window' => [16385, 2],
            'exactly two windows' => [32768, 2],
        ];
    }

    #[DataProvider('pageCounts')]
    public function test_the_page_count_is_the_size_in_windows_rounded_up(int $size, int $pages): void
    {
        $this->assertSame($pages, LogWindow::for($size, null, 1)->pages);
    }

    public function test_a_snapshot_inside_the_file_is_the_effective_size(): void
    {
        $window = LogWindow::for(40000, 20000, 1);

        $this->assertSame(20000, $window->size);
        $this->assertSame(2, $window->pages);
        $this->assertSame(20000, $window->end);
        // The last line may be completed past the snapshot, from bytes the file now has.
        $this->assertSame(19999 + 8192, $window->readLast);
    }

    /**
     * @return array<string, array{int}>
     */
    public static function ignoredSnapshots(): array
    {
        return [
            'larger than the file' => [50000],
            'zero' => [0],
            'negative' => [-5],
        ];
    }

    #[DataProvider('ignoredSnapshots')]
    public function test_a_snapshot_outside_the_file_falls_back_to_the_file_size(int $snapshot): void
    {
        $window = LogWindow::for(40000, $snapshot, 1);

        $this->assertSame(40000, $window->size);
        $this->assertSame(40000, $window->end);
    }

    /**
     * @return array<string, array{int, int}>
     */
    public static function outOfRangePages(): array
    {
        return [
            'page zero' => [40000, 0],
            'one past the last page' => [40000, 4],
            'page two of an empty file' => [0, 2],
        ];
    }

    #[DataProvider('outOfRangePages')]
    public function test_a_page_outside_the_file_is_refused(int $size, int $page): void
    {
        $this->expectException(\OutOfRangeException::class);

        LogWindow::for($size, null, $page);
    }

    public function test_the_last_page_of_the_file_is_accepted(): void
    {
        $this->assertSame(3, LogWindow::for(40000, null, 3)->pages);
    }

    public function test_an_empty_file_has_one_page_without_lines(): void
    {
        $window = LogWindow::for(0, null, 1);

        $this->assertFalse($window->hasBytes());
        $this->assertSame([], $window->lines(''));
    }

    public function test_a_small_file_is_one_page_of_its_lines_without_a_trailing_empty_line(): void
    {
        $this->assertSame(['one', 'two', 'three'], $this->page("one\ntwo\nthree\n", 1));
    }

    public function test_a_file_without_a_trailing_newline_keeps_its_last_line(): void
    {
        $this->assertSame(['one', 'two'], $this->page("one\ntwo", 1));
    }

    public function test_an_empty_line_inside_the_file_is_kept(): void
    {
        $this->assertSame(['one', '', 'three'], $this->page("one\n\nthree\n", 1));
    }

    public function test_a_line_crossing_the_window_start_belongs_to_the_next_page(): void
    {
        // 20000 bytes: page 1 is [3616, 20000). The crossing line runs from
        // 3000 to 4999 (its `\n` at 4999).
        $head = str_repeat('a', 2999)."\n";              // bytes 0..2999
        $crossing = str_repeat('c', 1999)."\n";          // bytes 3000..4999
        $tail = str_repeat(str_repeat('t', 99)."\n", 150); // bytes 5000..19999
        $file = $head.$crossing.$tail;
        $this->assertSame(20000, strlen($file));

        $page1 = $this->page($file, 1);
        $page2 = $this->page($file, 2);

        $this->assertSame(str_repeat('t', 99), $page1[0]);
        $this->assertCount(150, $page1);
        $this->assertNotContains(str_repeat('c', 1999), $page1);
        // Page 2 ends with the whole crossing line, completed past its window end.
        $this->assertSame([str_repeat('a', 2999), str_repeat('c', 1999)], $page2);
    }

    public function test_a_line_starting_exactly_at_the_window_start_belongs_to_the_page(): void
    {
        // Page 1 of a 20000-byte file starts at 3616; byte 3615 is a `\n`.
        $file = str_repeat('a', 3615)."\n".str_repeat('b', 16383)."\n";
        $this->assertSame(20000, strlen($file));

        $this->assertSame([str_repeat('b', 16383)], $this->page($file, 1));
        $this->assertSame([str_repeat('a', 3615)], $this->page($file, 2));
    }

    public function test_a_line_crossing_the_snapshot_end_is_completed_and_newer_lines_are_left_out(): void
    {
        // Snapshot 10: "one\nfour-" is inside, "four-two" crosses the end,
        // "new" was appended after page 1 was read.
        $file = "one\nfour-two\nnew\n";

        $this->assertSame(['one', 'four-two'], $this->page($file, 1, 10));
    }

    public function test_a_line_longer_than_the_tail_extra_stays_cut(): void
    {
        // Page 2 of a 40000-byte file ends at 23616; a line starting at 23000
        // runs 16000 bytes, past the 8192 bytes read after the window end.
        $file = str_repeat('a', 22999)."\n".str_repeat('L', 15999)."\n".str_repeat('z', 999)."\n";
        $this->assertSame(40000, strlen($file));

        $page2 = $this->page($file, 2);
        $long = end($page2);

        $this->assertSame(str_repeat('L', 23615 + 8192 - 23000 + 1), $long);
        $this->assertSame(23615 + 8192 + 1 - 23000, strlen($long));
    }

    public function test_a_window_inside_one_long_line_has_no_lines(): void
    {
        // One 40000-byte line: page 2 [7232, 23616) holds no line start.
        $file = str_repeat('x', 39999)."\n";

        $this->assertSame([], $this->page($file, 2));
        $this->assertSame([], $this->page($file, 1));
        $this->assertSame(str_repeat('x', 7231 + 8192 + 1), $this->page($file, 3)[0]);
    }

    /**
     * @return array<string, array{bool}>
     */
    public static function trailingNewline(): array
    {
        return ['with a trailing newline' => [true], 'without a trailing newline' => [false]];
    }

    #[DataProvider('trailingNewline')]
    public function test_the_pages_together_hold_every_line_once_in_file_order(bool $trailing): void
    {
        $lines = [];
        for ($i = 1; $i <= 2000; $i++) {
            // 1..199 characters, so lines cross the window edges at varied offsets.
            $lines[] = str_pad((string) $i, ($i * 37) % 199 + 1, '.');
        }
        $file = implode("\n", $lines).($trailing ? "\n" : '');
        $this->assertGreaterThan(3 * 16384, strlen($file));

        $this->assertSame($lines, $this->allPages($file));
    }
}
