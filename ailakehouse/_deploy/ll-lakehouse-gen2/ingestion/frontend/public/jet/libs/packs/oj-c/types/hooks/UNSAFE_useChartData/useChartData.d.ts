/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { TemplateSlot } from 'ojs/ojvcomponent';
import ArrayDataProvider = require('ojs/ojarraydataprovider');
import { Group } from '@oracle/oraclejet-preact/utils/UNSAFE_visTypes/chart';
import { LineAreaItem } from '@oracle/oraclejet-preact/UNSAFE_LineAreaChart/lineAreaChart.types';
import { StyleDefaults } from 'oj-c/area-chart/area-chart.types';
export type ChartItemTemplateContext<K, D> = {
    /**
     * @description
     * The data object of the current item.
     */
    data: D;
    /**
     * @description
     * The key of the current item.
     */
    key: K;
    /**
     * @description
     * The zero-based index of the current item.
     */
    index: number;
};
export type ChartSeriesTemplateContext<K, D> = {
    /**
     * @description
     * The array of objects which are chart items that belong to this series. The objects will have the following properties
     */
    items: ChartItemTemplateContext<K, D>[];
    /**
     * @description
     * The series id
     */
    id: string;
    /**
     * @description
     * The series index
     */
    index: number;
};
export type ChartGroupTemplateContext<K, D> = {
    /**
     * @description
     * The array of objects which are chart items that belong to this series. The objects will have the following properties
     */
    items: ChartItemTemplateContext<K, D>[];
    /**
     * @description
     * The key of the current item.
     */
    ids: string[];
    /**
     * @description
     * The group index
     */
    index: number;
    /**
     * @description
     * The depth of the group. The depth of the outermost group under the invisible root is 1.
     */
    depth: number;
};
/**
 * Hook that returns the processed sectional legend data.
 * TODO: JET-59089 replace with proper useTreeDataProvider
 * @returns
 */
export declare function useChartData<K, D>(dataProvider: ArrayDataProvider<K, D>, addBusyState: (description: string) => () => void, itemTemplate?: TemplateSlot<ChartItemTemplateContext<K, D>>, seriesTemplate?: TemplateSlot<ChartSeriesTemplateContext<K, D>>, groupTemplate?: TemplateSlot<ChartGroupTemplateContext<K, D>>, itemElementName?: string, seriesElementName?: string, groupElementName?: string, seriesComparator?: (context1: ChartSeriesTemplateContext<K, D>, context2: ChartSeriesTemplateContext<K, D>) => number, groupComparator?: (context1: ChartGroupTemplateContext<K, D>, context2: ChartGroupTemplateContext<K, D>) => number, styleDefaults?: StyleDefaults, chartType?: 'line' | 'area' | 'bar'): {
    series: import("oj-c/area-chart/area-chart.types").AreaChartSeries<K>[];
    preactSeries: {
        items: LineAreaItem<K>[];
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
        associatedYAxis: "y" | "y2";
    }[];
    groups: Group[];
    isLoading: boolean;
    idToDPItemMap: Map<K, D>;
    createGroupContext: (groupSymbol: symbol, groupIds: string[], index: number) => ChartGroupTemplateContext<K, D>;
};
