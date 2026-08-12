define(["require", "exports", "./dataUtil", "../PRIVATE_useVisData/useVisData", "preact/hooks", "oj-c/utils/PRIVATE_chartUtils/lineAreaUtils"], function (require, exports, dataUtil_1, useVisData_1, hooks_1, lineAreaUtils_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.useChartData = useChartData;
    /**
     * Hook that returns the processed sectional legend data.
     * TODO: JET-59089 replace with proper useTreeDataProvider
     * @returns
     */
    function useChartData(dataProvider, addBusyState, itemTemplate, seriesTemplate, groupTemplate, itemElementName, seriesElementName, groupElementName, seriesComparator, groupComparator, styleDefaults, chartType = 'line') {
        const { data, isLoading } = (0, useVisData_1.useVisData)({
            dataProvider,
            addBusyState
        });
        const { series, groups, createGroupContext } = (0, hooks_1.useMemo)(() => (0, dataUtil_1.createGroupsAndSeries)(data, itemTemplate, seriesTemplate, groupTemplate, itemElementName, seriesElementName, groupElementName, seriesComparator, groupComparator), [
            data,
            itemTemplate,
            seriesTemplate,
            groupTemplate,
            itemElementName,
            seriesElementName,
            groupElementName,
            seriesComparator,
            groupComparator
        ]);
        const idToDPItemMap = new Map(data.map((item) => [item.key, item.data]));
        const preactSeries = series.map((s, index) => {
            const _s = (0, lineAreaUtils_1.transformSeries)(s, index, chartType);
            return {
                ..._s,
                items: _s['items'].map((item) => {
                    return (0, lineAreaUtils_1.transformItem)(item, s, styleDefaults);
                })
            };
        });
        return {
            series,
            preactSeries,
            groups: groups,
            isLoading,
            idToDPItemMap,
            createGroupContext
        };
    }
});
