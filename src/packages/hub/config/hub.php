<?php

return [
    // The PanelAlpha Hub the panel pairs with (old `config('system.hub.url')`).
    'url' => env('HUB_URL', 'https://hub.panelalpha.com'),

    // PanelAlpha Go, whose catalog API (`/api/catalog/v1`) a paired panel reads with a Hub token.
    'go_url' => env('GO_API_BASE', 'https://go.panelalpha.com'),
];
