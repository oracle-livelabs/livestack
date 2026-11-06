/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { MarkerShapes } from '@oracle/oraclejet-preact/utils/UNSAFE_visTypes/common';
/**
 * Transforms the corepack PictoChart item to preact PictoChart item.
 * @param item
 * @param index
 * @returns
 */
export declare function transformItem<K>(dataItem: any): {
    color: string;
    accessibleLabel: string;
    count: number;
    rowSpan: number;
    columnSpan: number;
    id: K;
    shape: MarkerShapes;
    label: string;
    drilling: 'inherit' | 'off' | 'on';
};
