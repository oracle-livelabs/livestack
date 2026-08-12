/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
define(["require", "exports", "../picto-chart-item/picto-chart-item"], function (require, exports, picto_chart_item_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.transformItem = transformItem;
    /**
     * Transforms the corepack PictoChart item to preact PictoChart item.
     * @param item
     * @param index
     * @returns
     */
    function transformItem(dataItem) {
        const item = { ...picto_chart_item_1.pictoChartItemDefaults, ...dataItem };
        return {
            color: item.color,
            accessibleLabel: item.shortDesc,
            count: item.count,
            rowSpan: item.rowSpan,
            columnSpan: item.columnSpan,
            id: item.key != null ? item?.key : item.id,
            shape: item.shape,
            label: item.name,
            drilling: item.drilling
        };
    }
});
