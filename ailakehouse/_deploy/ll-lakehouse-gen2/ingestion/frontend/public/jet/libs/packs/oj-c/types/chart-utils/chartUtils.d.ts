/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { Dimension } from '@oracle/oraclejet-preact/utils/UNSAFE_visTypes/common';
/**
 * Returns the sizing information of the y axis.
 * @param {CLineChartElement} element  An oj-c-line-chart or oj-c-area-chart element.
 */
export declare const getYaxis: (element: HTMLElement) => {
    /**
     * The function that returns the preferred size of the x axis.
     * @param width
     * @param height
     */
    getPreferredSize: (width: number, height: number) => {
        width: number;
        height: number;
    };
    /**
     * The bounds of the y axis relative to the chart.
     */
    bounds: Dimension;
};
/**
 * Returns the sizing information of the y2 axis.
 * @param {CLineChartElement} element  An oj-c-line-chart or oj-c-area-chart element.
 */
export declare const getY2axis: (element: HTMLElement) => {
    /**
     * The function that returns the preferred size of the y2 axis.
     * @param width
     * @param height
     * @returns
     */
    getPreferredSize: (width: number, height: number) => {
        width: number;
        height: number;
    };
    /**
     * The bounds of the y2 axis relative to the chart.
     */
    bounds: Dimension;
};
/**
 * Returns the sizing information of the x axis.
 * @param {CLineChartElement} element  An oj-c-line-chart or oj-c-area-chart element.
 */
export declare const getXaxis: (element: HTMLElement) => {
    /**
     * The function that returns the preferred size of the x axis.
     * @param width
     * @param height
     * @returns
     */
    getPreferredSize: (width: number, height: number) => {
        width: number;
        height: number;
    };
    /**
     * The bounds of the x axis relative to the chart.
     */
    bounds: Dimension;
};
