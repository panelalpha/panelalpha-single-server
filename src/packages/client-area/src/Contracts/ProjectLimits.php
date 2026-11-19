<?php

namespace PanelAlpha\ClientArea\Contracts;

use PanelAlpha\ClientArea\Models\Application;

/**
 * The limits a client may set on one project: the six the Engine enforces on
 * the container (project-usage change). `ceilings()` is what the project page
 * shows next to each limit. Community has no plan, so the controller's default
 * answers no ceiling; the paid edition binds the plan's values as the ceilings.
 */
interface ProjectLimits
{
    /** The Engine config keys of the limits a client may change. */
    public const array KEYS = ['memory_limit', 'cpu_limit', 'disk_space_limit', 'inodes_limit', 'device_read_bps', 'device_write_bps'];

    /**
     * The highest value the project may be given for each key in {@see self::KEYS},
     * in the Engine's unit (MB, cores, count, bytes a second); null means no ceiling.
     *
     * @return array<string, int|float|null>
     */
    public function ceilings(Application $application): array;

    /**
     * Save the six limits of a project and answer its fresh `resources` block.
     * The values are in the Engine's unit and carry every key of {@see self::KEYS}
     * (`-1` is no limit). The paid edition refuses a value above its ceiling with
     * a `ValidationException`; an Engine refusal is an `EngineValidationException`.
     *
     * @param  array<string, int|float>  $values
     * @return array<string, mixed>
     */
    public function update(Application $application, array $values): array;
}
