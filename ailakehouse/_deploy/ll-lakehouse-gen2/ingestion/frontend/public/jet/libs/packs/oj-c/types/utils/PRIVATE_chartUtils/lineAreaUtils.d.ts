/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { Group, ValueFormats } from '@oracle/oraclejet-preact/utils/UNSAFE_visTypes/chart';
import { AreaChartSeries, AreaItem, StyleDefaults } from 'oj-c/area-chart/area-chart.types';
/**
 * Transforms the corepack area-chart item to preact area-chart item.
 */
export declare function transformItem<K>(item: AreaItem<K>, series: AreaChartSeries<K>, styleDefaults?: StyleDefaults): {
    markerColor: string | undefined;
    accessibleLabel: string | undefined;
    value: number;
    label: string | undefined;
    id: K;
    drilling: "off" | "inherit" | "on" | undefined;
    isMarkerDisplayed: boolean | "" | undefined;
    markerType: false | "square" | "circle" | "diamond" | "human" | "plus" | "star" | "triangleDown" | "triangleUp" | undefined;
    markerSize: number | undefined;
    labelPosition: "center" | "belowMarker" | "aboveMarker" | "beforeMarker" | "afterMarker" | undefined;
};
export declare function transformSeries<K>(series: AreaChartSeries<K>, seriesIndex: number, seriesType: 'bar' | 'line' | 'area' | 'lineWithArea'): {
    lineColor: string;
    areaColor: string;
    accessibleLabel: string | undefined;
    drilling: "off" | "inherit" | "on" | undefined;
    lineStyle: "dashed" | "solid" | "dotted" | undefined;
    lineType: "curved" | "straight" | undefined;
    lineWidth: number | undefined;
    markerShape: "auto" | "square" | "circle" | "diamond" | "human" | "plus" | "star" | "triangleDown" | "triangleUp" | undefined;
    markerColor: string;
    markerDisplayed: string | undefined;
    markerSize: number | undefined;
    id: K;
    name: string | undefined;
    items: AreaItem<K>[];
    associatedYAxis: "y" | "y2";
};
export declare function transformGroup(group: Record<string, any>): Group;
/**
 * Transforms the corepack line area chart item to preact line area chart item.
 *
 * @param {object} valueFormats - The value formats object.
 * @return {object} The transformed value formats object.
 */
export declare function transformValueFormats(valueFormats: any): ValueFormats | undefined;
