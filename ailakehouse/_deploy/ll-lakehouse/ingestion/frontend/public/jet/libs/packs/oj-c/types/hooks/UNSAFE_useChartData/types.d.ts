/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
export type GenericChartItem<K extends string | number, D extends any> = {
    id: K;
    _itemData: D;
    groupId: string[];
    seriesId: (string | number)[];
    value?: number;
};
export type GenericChartSeriesItem<K extends string | number, D extends any> = {
    id: string | number;
    items: GenericChartItem<K, D>;
};
