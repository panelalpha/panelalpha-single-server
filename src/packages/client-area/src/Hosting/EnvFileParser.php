<?php

namespace PanelAlpha\ClientArea\Hosting;

/**
 * Ported verbatim from the old panel's `App\Lib\Helpers\EnvFileParser`.
 * The env editor's one `.env` parser: it moved here from client-area-legacy
 * with the classic read, which is no longer an Engine-gap workaround.
 *
 * Parse a .env file into a list of rows. Each row is one of:
 *   - ['type' => 'variable', 'key' => 'KEY', 'value' => 'value']
 *   - ['type' => 'comment',  'text' => '# comment']
 *   - ['type' => 'blank']
 *
 * The parser is intentionally simple and tolerant: it preserves the original
 * ordering of rows, keeps comments and blank lines interleaved with variables,
 * and only round-trips content. It does NOT attempt to interpret escape
 * sequences or process directives like `export`.
 */
final class EnvFileParser
{
    /**
     * @return array<int, array<string, string>>
     */
    public static function parse(string $contents): array
    {
        $rows = [];
        $lines = preg_split("/\r\n|\n|\r/", $contents) ?: [];
        $lastIndex = count($lines) - 1;
        foreach ($lines as $index => $line) {
            $trimmed = ltrim($line);
            if ($trimmed === '') {
                if ($index === $lastIndex) {
                    continue;
                }
                $rows[] = ['type' => 'blank'];
                continue;
            }
            if (str_starts_with($trimmed, '#')) {
                $rows[] = ['type' => 'comment', 'text' => $line];
                continue;
            }
            if (preg_match('/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/s', $line, $m)) {
                $key = $m[1];
                $rawValue = $m[2];
                $value = self::unquote($rawValue);
                $rows[] = [
                    'type' => 'variable',
                    'key' => $key,
                    'value' => $value,
                ];
                continue;
            }
            $rows[] = ['type' => 'comment', 'text' => $line];
        }

        return $rows;
    }

    /**
     * Serialise a list of rows back into a .env file string.
     *
     * @param  array<int, array<string, string>>  $rows
     */
    public static function serialise(array $rows): string
    {
        $lines = [];
        foreach ($rows as $row) {
            switch ($row['type'] ?? null) {
                case 'variable':
                    $key = (string) ($row['key'] ?? '');
                    $value = (string) ($row['value'] ?? '');
                    if ($key === '') {
                        continue 2;
                    }
                    $lines[] = $key.'='.self::quote($value);
                    break;
                case 'comment':
                    $lines[] = (string) ($row['text'] ?? '');
                    break;
                case 'blank':
                    $lines[] = '';
                    break;
            }
        }

        return implode("\n", $lines)."\n";
    }

    /**
     * Strip matching surrounding quotes and unescape basic escape sequences.
     * If the value is not quoted, it is trimmed of trailing inline comments.
     */
    private static function unquote(string $raw): string
    {
        $value = $raw;
        $len = strlen($value);
        if ($len >= 2) {
            $first = $value[0];
            $last = $value[$len - 1];
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $value = substr($value, 1, -1);
                if ($first === '"') {
                    $value = str_replace(
                        ['\\n', '\\r', '\\t', '\\"', '\\\\'],
                        ["\n", "\r", "\t", '"', '\\'],
                        $value,
                    );
                }

                return $value;
            }
        }
        $hashPos = strpos($value, ' #');
        if ($hashPos !== false) {
            $value = substr($value, 0, $hashPos);
        }

        return rtrim($value);
    }

    /**
     * Quote a value for safe round-trip in a .env file.
     * Quote when the value contains whitespace, '#', '"', "'", '\n', or starts with a quote.
     */
    private static function quote(string $value): string
    {
        if ($value === '') {
            return '';
        }
        $needsQuoting = preg_match('/[\s"\'#\\\\]/', $value) === 1
            || $value[0] === '"' || $value[0] === "'";
        if (! $needsQuoting) {
            return $value;
        }
        $escaped = str_replace(['\\', '"', "\n", "\r", "\t"], ['\\\\', '\\"', '\\n', '\\r', '\\t'], $value);

        return '"'.$escaped.'"';
    }
}
