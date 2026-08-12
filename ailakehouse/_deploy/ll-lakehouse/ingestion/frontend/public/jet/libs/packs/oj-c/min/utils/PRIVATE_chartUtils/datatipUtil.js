/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
define(["require", "exports", "../PRIVATE_vizUtils/datatipUtil"], function (require, exports, datatipUtil_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getAreaChartDatatip = getAreaChartDatatip;
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
    function getAreaChartDatatip(detail, series, groups, idToDPItemMap, datatipTemplate, datatipConfig) {
        const isItem = detail.type === 'item';
        const data = isItem
            ? series[detail.seriesIndex].items[detail.groupIndex]
            : detail.data;
        const groupPath = isItem ? detail.groupPath : undefined;
        const groupData = isItem ? (0, datatipUtil_1.getGroupData)(groupPath, groups) : undefined;
        const seriesId = isItem ? series[detail.seriesIndex].id : undefined;
        const seriesData = isItem
            ? series[detail.seriesIndex]
            : undefined;
        const group = isItem
            ? groupPath &&
                groupData &&
                (groupPath.length > 1 ? groupData.map((i) => i.id) : groupData[0].id)
            : undefined;
        const itemData = isItem ? idToDPItemMap.get(data.id) : undefined;
        const corepackContext = {
            color: data.color,
            data,
            groupData,
            groupPath,
            group,
            seriesData,
            itemData: itemData,
            id: data.id,
            label: isItem ? data.label : undefined,
            series: seriesId,
            value: detail.type !== 'referenceArea'
                ? data.value
                : undefined,
            high: detail.type === 'referenceArea'
                ? data.high
                : undefined,
            low: detail.type === 'referenceArea' ? data.low : undefined
        };
        const datatipConfiguration = datatipConfig
            ? datatipConfig(corepackContext)
            : undefined;
        let content = '';
        if (datatipConfiguration?.rendered !== 'off') {
            content = datatipTemplate?.(corepackContext);
        }
        return {
            content,
            borderColor: datatipConfiguration?.style?.borderColor,
            defaultContainer: datatipConfiguration?.defaultContainer
        };
    }
});
