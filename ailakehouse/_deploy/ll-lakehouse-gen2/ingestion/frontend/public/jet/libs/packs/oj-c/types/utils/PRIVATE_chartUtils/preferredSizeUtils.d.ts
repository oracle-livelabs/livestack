/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
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
export declare function getChartLegendOffset(options: {
    position: 'top' | 'bottom' | 'start' | 'end';
    isRtl: boolean;
    renderLegend: boolean;
    preferredSize?: {
        width: number;
        height: number;
    };
    gap?: {
        width: number;
        height: number;
    };
}): {
    x: number;
    y: number;
};
export declare function adjustForLegendOffset(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
} | undefined, offset: {
    x: number;
    y: number;
}): any;
