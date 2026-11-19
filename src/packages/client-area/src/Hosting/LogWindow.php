<?php

namespace PanelAlpha\ClientArea\Hosting;

/**
 * One page of a log file read from its end (the paged log view of
 * client-area-next): page 1 is the newest WINDOW bytes, page 2 the WINDOW
 * bytes before them, and so on.
 *
 * - The effective size is the snapshot (the size page 1 reported) when
 *   `0 < snapshot <= fileSize`, otherwise the file's size, so the page numbers
 *   stay put while the file grows.
 * - `pages = max(1, ceil(size / WINDOW))`; page k covers `[start, end)` with
 *   `end = size - (k - 1) * WINDOW` and `start = max(0, end - WINDOW)`.
 * - The read is `readFirst..readLast` (inclusive, a `Range: bytes=` value):
 *   one byte before `start` (to tell whether `start` begins a line) and up to
 *   TAIL_EXTRA bytes after `end` (to complete the last line), never past the
 *   file's real end.
 * - A page holds the lines whose first byte lies in `[start, end)`, in file
 *   order and without their `\n`; a line that began before `start` belongs to
 *   the next page. The last line is completed up to its `\n` within TAIL_EXTRA
 *   bytes; a longer one stays cut.
 *
 * Pure: no Laravel, no I/O.
 */
final class LogWindow
{
    /** Bytes of the file one page covers. */
    public const int WINDOW = 16384;

    /** Bytes read past a page's end to complete its last line. */
    public const int TAIL_EXTRA = 8192;

    private function __construct(
        public readonly int $size,
        public readonly int $pages,
        public readonly int $start,
        public readonly int $end,
        public readonly int $readFirst,
        public readonly int $readLast,
    ) {}

    /**
     * @throws \OutOfRangeException when the page is below 1 or past the last page
     */
    public static function for(int $fileSize, ?int $snapshot, int $page): self
    {
        $fileSize = max(0, $fileSize);
        $size = $snapshot !== null && $snapshot > 0 && $snapshot <= $fileSize ? $snapshot : $fileSize;
        $pages = max(1, intdiv($size + self::WINDOW - 1, self::WINDOW));

        if ($page < 1 || $page > $pages) {
            throw new \OutOfRangeException("Page {$page} is outside 1..{$pages}.");
        }

        $end = $size - ($page - 1) * self::WINDOW;
        $start = max(0, $end - self::WINDOW);

        return new self(
            $size,
            $pages,
            $start,
            $end,
            max($start - 1, 0),
            min($end - 1 + self::TAIL_EXTRA, $fileSize - 1),
        );
    }

    /** Whether the page has bytes to read (an empty file has none). */
    public function hasBytes(): bool
    {
        return $this->end > $this->start && $this->readLast >= $this->readFirst;
    }

    /**
     * The page's lines from the bytes read at `readFirst..readLast`.
     *
     * @return list<string>
     */
    public function lines(string $bytes): array
    {
        if (! $this->hasBytes()) {
            return [];
        }

        $length = strlen($bytes);
        // Offsets inside $bytes of the window's start and end.
        $from = $this->start - $this->readFirst;
        $to = $this->end - $this->readFirst;

        $position = $this->firstLineStart($bytes, $from);
        if ($position === null) {
            return [];
        }

        $lines = [];
        while ($position < $to && $position < $length) {
            $newline = strpos($bytes, "\n", $position);
            if ($newline === false) {
                // The file's end without a trailing `\n`, or a line longer
                // than TAIL_EXTRA: keep what was read.
                $lines[] = substr($bytes, $position);

                break;
            }

            $lines[] = substr($bytes, $position, $newline - $position);
            $position = $newline + 1;
        }

        return $lines;
    }

    /**
     * Offset in $bytes of the first line that begins at or after $from; null
     * when the window holds no line start.
     */
    private function firstLineStart(string $bytes, int $from): ?int
    {
        if ($this->start === 0) {
            return $from;
        }

        // The byte before the window (read for this check) ends a line.
        if ($from > strlen($bytes)) {
            return null;
        }

        if (substr($bytes, $from - 1, 1) === "\n") {
            return $from;
        }

        $newline = strpos($bytes, "\n", $from);

        return $newline === false ? null : $newline + 1;
    }
}
