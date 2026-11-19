<?php

namespace PanelAlpha\ClientArea\Projects;

/**
 * Per-deploy step skipping: the panel's step categories mapped to the Engine's
 * names.
 *
 * ASSUMED ENGINE CONTRACT - to be agreed with the Engine team (see
 * context/changes/source-card-improvements/engine-handoff.md, items 1-3):
 *  - `skip` (list of `dependencies|assets|upgrade`) is accepted by
 *    `POST rebuild`, `POST deploy-archive`, `POST git/pull` and
 *    `PUT git/change-branch`;
 *  - `GET projects/{u}/inspect` announces the supported names in
 *    `application.skippable` (a list); an absent field means nothing is
 *    skippable, which is how the Engine behaves today.
 * Every name that depends on this agreement lives in this class only.
 */
final class DeploySkip
{
    /** The panel category => Engine step name. */
    public const array CATEGORY_TO_ENGINE = [
        'dependencies' => 'dependencies',
        'build' => 'assets',
        'migrations' => 'upgrade',
    ];

    /** The key of `inspect.application` that lists the skippable Engine steps. */
    public const string INSPECT_CAPABILITY_FIELD = 'skippable';

    /**
     * The panel categories the inspect report announces as skippable.
     *
     * @param  array<string, mixed>  $app  inspect `application`
     * @return list<string>
     */
    public static function supportedCategories(array $app): array
    {
        $announced = $app[self::INSPECT_CAPABILITY_FIELD] ?? null;
        if (! is_array($announced)) {
            return [];
        }

        $supported = [];
        foreach (self::CATEGORY_TO_ENGINE as $category => $engineName) {
            if (in_array($engineName, $announced, true)) {
                $supported[] = $category;
            }
        }

        return $supported;
    }

    /**
     * The Engine `skip` list for the panel categories, in a stable order.
     *
     * @param  list<string>  $categories
     * @return list<string>
     */
    public static function toEngine(array $categories): array
    {
        $names = [];
        foreach (self::CATEGORY_TO_ENGINE as $category => $engineName) {
            if (in_array($category, $categories, true)) {
                $names[] = $engineName;
            }
        }

        return $names;
    }
}
