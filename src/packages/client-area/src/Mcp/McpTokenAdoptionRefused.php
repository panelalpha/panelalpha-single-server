<?php

namespace PanelAlpha\ClientArea\Mcp;

use RuntimeException;

/**
 * An operator asked to adopt an Engine MCP token the panel must not take over
 *Unknown, the panel's own API token, or already owned.
 */
final class McpTokenAdoptionRefused extends RuntimeException {}
