<?php

namespace PanelAlpha\ClientArea\Events;

/**
 * The project list {@see ProjectListPresenting} announced is presented (review
 * 54 H7): what an edition looked up for it is forgotten, so a later read in
 * the same request queries again. Dispatched synchronously, also when the
 * presentation failed.
 */
final class ProjectListPresented
{
}
