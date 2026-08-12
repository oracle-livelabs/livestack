/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
define(["require", "exports", "@oracle/oraclejet-preact/utils/UNSAFE_visUtils"], function (require, exports, UNSAFE_visUtils_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.transformItem = transformItem;
    exports.transformSeries = transformSeries;
    exports.transformGroup = transformGroup;
    exports.transformValueFormats = transformValueFormats;
    const colorRamp = (0, UNSAFE_visUtils_1.getColorRamp)();
    const markerShapes = (0, UNSAFE_visUtils_1.getShapeRamp)();
    /**
     * Transforms the corepack area-chart item to preact area-chart item.
     */
    function transformItem(item, series, styleDefaults) {
        return {
            markerColor: item.color || series.markerColor || styleDefaults?.markerColor,
            accessibleLabel: item.shortDesc,
            value: item.value,
            label: item.label,
            id: item.id,
            drilling: item.drilling || series.drilling,
            isMarkerDisplayed: (item.markerDisplayed && item.markerDisplayed !== 'off') ||
                (series.markerDisplayed && series.markerDisplayed !== 'off'),
            markerType: (item.markerShape !== 'auto' && item.markerShape) ||
                (series.markerShape !== 'auto' && series.markerShape) ||
                (styleDefaults?.markerShape !== 'auto' && styleDefaults?.markerShape),
            markerSize: (item.markerSize !== undefined && item.markerSize) || series.markerSize,
            labelPosition: styleDefaults?.dataLabelPosition
        };
    }
    function transformSeries(series, seriesIndex, seriesType) {
        const isLineArea = seriesType === 'area' || seriesType === 'lineWithArea' || seriesType === 'line';
        return {
            lineColor: series.color || colorRamp[seriesIndex % colorRamp.length],
            // TODO: this will need to consider chart types
            areaColor: series.areaColor || series.color || colorRamp[seriesIndex % colorRamp.length],
            accessibleLabel: series.shortDesc,
            drilling: series.drilling,
            lineStyle: series.lineStyle,
            lineType: series.lineType,
            lineWidth: series.lineWidth,
            markerShape: series.markerShape ||
                (isLineArea ? markerShapes[seriesIndex % markerShapes.length] : undefined),
            markerColor: series.markerColor || colorRamp[seriesIndex % colorRamp.length],
            markerDisplayed: series.markerDisplayed,
            markerSize: series.markerSize,
            id: series.id,
            name: series.name,
            items: series.items,
            associatedYAxis: series.assignedToY2 === 'on' ? 'y2' : 'y'
        };
    }
    function transformGroup(group) {
        return {
            drilling: group['drilling'],
            name: group['name'],
            id: group['id'],
            accessibleLabel: group['shortDesc']
        };
    }
    /**
     * Transforms the corepack line area chart item to preact line area chart item.
     *
     * @param {object} valueFormats - The value formats object.
     * @return {object} The transformed value formats object.
     */
    function transformValueFormats(valueFormats) {
        if (!valueFormats)
            return;
        const formats = {};
        if (valueFormats.value) {
            formats.value = {
                isDisplayed: valueFormats.value?.tooltipDisplay !== 'off',
                label: valueFormats.value?.tooltipLabel,
                format: valueFormats.value?.converter?.format
            };
        }
        if (valueFormats.y2) {
            formats.y2 = {
                isDisplayed: valueFormats.y2?.tooltipDisplay !== 'off',
                label: valueFormats.y2?.tooltipLabel,
                format: valueFormats.y2?.converter?.format
            };
        }
        if (valueFormats.series) {
            formats.series = {
                isDisplayed: valueFormats.series?.tooltipDisplay !== 'off',
                label: valueFormats.series?.tooltipLabel
            };
        }
        if (valueFormats.group) {
            formats.group = {
                isDisplayed: valueFormats.group?.tooltipDisplay !== 'off',
                label: valueFormats.group?.tooltipLabel
            };
        }
        if (valueFormats.label) {
            formats.label = {
                isDisplayed: valueFormats.label?.tooltipDisplay !== 'off',
                label: valueFormats.label?.tooltipLabel
            };
        }
        return formats;
    }
});
