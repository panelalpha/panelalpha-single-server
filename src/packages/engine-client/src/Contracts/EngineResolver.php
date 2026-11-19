<?php

namespace PanelAlpha\EngineClient\Contracts;

use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Exceptions\EngineNotConfiguredException;

/**
 * Question 2 of the panel's edition contracts: "which Engine hosts this
 * project, and how do I reach it?" – the only way a caller reaches an Engine.
 *
 * Community/Pro: one Engine (SingleEngineResolver). Multi: an `engines` table keyed
 * by the Engine id. The resolver knows Engines only, never a panel model: a
 * project's client is `forEngine()` of its Engine id.
 */
interface EngineResolver
{
    /**
     * Client for an Engine by its id – for a project's Engine and for work that
     * is not tied to an existing project (sync, provisioning, server metrics).
     *
     * @throws EngineNotConfiguredException
     */
    public function forEngine(int $engineId): EngineClient;

    /**
     * The Engine a panel-wide action with no bound application targets:
     * provisioning, the onboarding domain step, server metrics and the
     * Engine-wide proxy-rule list. Community/Pro: the one Engine; Multi: the default
     * row in its `engines` table.
     */
    public function defaultEngineId(): int;

    /**
     * Ids of every Engine this panel knows about (used by the sync scheduler).
     * Must not call the Engine or fail when credentials are missing.
     *
     * @return list<int>
     */
    public function engineIds(): array;
}
