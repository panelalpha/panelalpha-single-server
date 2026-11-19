<?php

namespace PanelAlpha\ClientArea\Http\Presenters;

use PanelAlpha\ClientArea\Models\Label;

/**
 * Shapes a label for the Client Area: just title +
 * colour, as the old LabelResource did.
 */
final class LabelPresenter
{
    /**
     * @return array{title: string, color: string}
     */
    public function present(Label $label): array
    {
        return ['title' => $label->title, 'color' => $label->color];
    }
}
