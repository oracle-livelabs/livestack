/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { ComponentChildren } from 'preact';
import { LineAreaItem } from '@oracle/oraclejet-preact/UNSAFE_LineAreaChart/lineAreaChart.types';
import { DatatipConfig, DatatipTemplateContext } from '../../area-chart/area-chart.types';
import { Group, ChartDatatipDetail } from '@oracle/oraclejet-preact/utils/UNSAFE_visTypes/chart';
/**
 * Generates datatip content for area chart items
 * @param detail The item detail containing series and group indices
 * @param series The chart series data
 * @param groups The chart groups data
 * @param idToDPItemMap Map of item IDs to data provider items
 * @param datatipTemplate Template function for custom datatip content
 * @param datatipConfig Configuration function for datatip appearance
 * @returns Object containing content, borderColor, and defaultContainer
 */
export declare function getAreaChartDatatip<K extends string | number, D extends any>(detail: ChartDatatipDetail<K, LineAreaItem<K>>, series: any[], groups: Group[], idToDPItemMap: Map<K, D>, datatipTemplate?: (context: DatatipTemplateContext<K, D>) => ComponentChildren, datatipConfig?: (context: DatatipTemplateContext<K, D>) => DatatipConfig): {
    content: ComponentChildren;
    borderColor: import("csstype").Property.Color | undefined;
    defaultContainer: "disabled" | "enabled" | undefined;
};
