/**
 * @license
 * Copyright (c) 2018 %CURRENT_YEAR%, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { ItemContext } from 'ojs/ojcommontypes';
import { ChartGroupTemplateContext, ChartItemTemplateContext, ChartSeriesTemplateContext } from './useChartData';
import { TemplateSlot } from 'ojs/ojvcomponent';
import { Group } from '@oracle/oraclejet-preact/utils/UNSAFE_visTypes/chart';
import { AreaChartSeries } from 'oj-c/area-chart/area-chart.types';
/**
 * Takes the dataProvider and templates and returns the series, group and getDataItem needed by preact charts
 */
declare const createGroupsAndSeries: <K, D>(data: ItemContext<K, D>[], itemTemplate?: TemplateSlot<ChartItemTemplateContext<K, D>>, seriesTemplate?: TemplateSlot<ChartSeriesTemplateContext<K, D>>, groupTemplate?: TemplateSlot<ChartGroupTemplateContext<K, D>>, itemElementName?: string, seriesElementName?: string, groupElementName?: string, seriesComparator?: (context1: ChartSeriesTemplateContext<K, D>, context2: ChartSeriesTemplateContext<K, D>) => number, groupComparator?: (context1: ChartGroupTemplateContext<K, D>, context2: ChartGroupTemplateContext<K, D>) => number) => {
    groups: Group[];
    series: AreaChartSeries<K>[];
    createGroupContext: (groupSymbol: symbol, groupIds: string[], index: number) => ChartGroupTemplateContext<K, D>;
};
export { createGroupsAndSeries };
