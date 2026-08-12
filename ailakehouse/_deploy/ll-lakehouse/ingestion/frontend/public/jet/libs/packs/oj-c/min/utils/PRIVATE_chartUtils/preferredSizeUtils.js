/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getChartLegendOffset = getChartLegendOffset;
    exports.adjustForLegendOffset = adjustForLegendOffset;
    /**
     * Computes the offset of the chart drawing origin within the Root container
     * based on the legend placement, its preferred size, legend gap, and RTL.
     *
     * When the legend is positioned at:
     * - top: offsetY = legendHeight + gap.height
     * - bottom: offsetY = 0
     * - start: offsetX = legendWidth + gap.width in LTR, 0 in RTL
     * - end: offsetX = 0 in LTR, legendWidth + gap.width in RTL
     *
     * If renderLegend is false or preferred size is not yet resolved, zero sizes are used,
     * resulting in zero offset until a subsequent render updates it.
     */
    function getChartLegendOffset(options) {
        const { position, isRtl, renderLegend } = options;
        if (!renderLegend)
            return { x: 0, y: 0 };
        const size = options.preferredSize ?? { width: 0, height: 0 };
        const gap = options.gap ?? { width: 0, height: 0 };
        switch (position) {
            case 'top':
                return { x: 0, y: size.height + gap.height };
            case 'bottom':
                return { x: 0, y: 0 };
            case 'start':
                return { x: isRtl ? 0 : size.width + gap.width, y: 0 };
            case 'end':
                return { x: isRtl ? size.width + gap.width : 0, y: 0 };
            default:
                return { x: 0, y: 0 };
        }
    }
    function adjustForLegendOffset(bounds, offset) {
        if (!bounds)
            return bounds;
        return {
            x: bounds.x + offset.x,
            y: bounds.y + offset.y,
            width: bounds.width,
            height: bounds.height
        };
    }
});
