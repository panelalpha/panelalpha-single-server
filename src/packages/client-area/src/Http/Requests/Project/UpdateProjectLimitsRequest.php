<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use PanelAlpha\ClientArea\Contracts\ProjectLimits;

/**
 * PUT /projects/{application}/limits – the six limits a client may change on a
 * project (project-usage). All six are sent every time; `-1` is "no limit" (a
 * missing value would clear the Engine's, so it is never `null`). The Engine
 * still checks the server-specific bounds (memory above the server's budget)
 * and answers 422, which the panel passes on.
 */
final class UpdateProjectLimitsRequest extends FormRequest
{
    /** The largest whole value for a limit in MB, a count or bytes a second (a 32-bit signed integer). */
    public const int MAX_INTEGER = 2147483647;

    /** The most CPU cores a project may be given. */
    public const int MAX_CPU = 1024;

    /** The smallest CPU share: a hundredth of a core (the Engine takes any decimal above 0, docker `cpus` starts at 0.01). */
    public const float MIN_CPU = 0.01;

    /** Limits where the Engine reads 0 as "not enforced", the same as -1. */
    private const ZERO_IS_UNLIMITED = ['cpu_limit', 'disk_space_limit', 'inodes_limit', 'device_read_bps', 'device_write_bps'];

    /**
     * An old client sends back the 0 it read. The Engine treats 0 as no limit, so it becomes -1 here.
     * Memory has no "no limit", so its 0 stays and fails the rules.
     */
    protected function prepareForValidation(): void
    {
        $fixed = [];
        foreach (self::ZERO_IS_UNLIMITED as $key) {
            /** @var mixed $value */
            $value = $this->input($key);
            if ((is_int($value) || is_float($value) || is_string($value)) && is_numeric($value) && (float) $value === 0.0) {
                $fixed[$key] = -1;
            }
        }
        if ($fixed !== []) {
            $this->merge($fixed);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // 0 never gets here for cpu, disk, inodes and disk speed (prepareForValidation makes it -1).
        // After that, "no limit" is -1 and a value is at least 1.
        $unlimitedOrPositive = static function (string $attribute, mixed $value, Closure $fail): void {
            if (is_numeric($value) && ((float) $value === -1.0 || (float) $value >= 1.0)) {
                return;
            }
            $fail(trans('client-area::general.limit_unlimited_or_positive'));
        };

        $unlimitedOrFraction = static function (string $attribute, mixed $value, Closure $fail): void {
            if (is_numeric($value) && ((float) $value === -1.0 || (float) $value >= self::MIN_CPU)) {
                return;
            }
            $fail(trans('client-area::general.limit_unlimited_or_min_cpu', ['min' => self::MIN_CPU]));
        };

        return [
            // The Engine's lowest project memory (a container project needs more; the Engine says so).
            // The highest depends on the server's memory budget, which only the Engine knows.
            'memory_limit' => ['required', 'integer', 'min:6', 'max:'.self::MAX_INTEGER],
            // Fractions of a core: -1, or from 0.01 to 1024.
            'cpu_limit' => ['required', 'numeric', 'max:'.self::MAX_CPU, $unlimitedOrFraction],
            'disk_space_limit' => ['required', 'integer', 'max:'.self::MAX_INTEGER, $unlimitedOrPositive],
            'inodes_limit' => ['required', 'integer', 'max:'.self::MAX_INTEGER, $unlimitedOrPositive],
            'device_read_bps' => ['required', 'integer', 'max:'.self::MAX_INTEGER, $unlimitedOrPositive],
            'device_write_bps' => ['required', 'integer', 'max:'.self::MAX_INTEGER, $unlimitedOrPositive],
        ];
    }

    /**
     * The six values as numbers: whole values as int, CPU cores keep a decimal part.
     *
     * @return array<string, int|float>
     */
    public function limits(): array
    {
        $values = [];
        foreach (ProjectLimits::KEYS as $key) {
            $number = $this->float($key);
            $values[$key] = floor($number) === $number ? (int) $number : $number;
        }

        return $values;
    }
}
