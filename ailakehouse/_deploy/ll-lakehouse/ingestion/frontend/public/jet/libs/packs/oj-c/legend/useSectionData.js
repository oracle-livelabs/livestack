define(["require", "exports", "preact/compat", "../utils/PRIVATE_vizUtils/TemplateHandler", "../hooks/UNSAFE_useDataProvider/useDataProvider", "ojs/ojflattenedtreedataproviderview", "ojs/ojkeyset"], function (require, exports, compat_1, TemplateHandler_1, useDataProvider_1, FlattenedTreeDataProviderView, ojkeyset_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.useSectionData = useSectionData;
    /**
     * Hook that returns the processed sectional legend data.
     * TODO: JET-59089 replace with proper useTreeDataProvider
     * @returns
     */
    function useSectionData(dataProvider, addBusyState, sectionTemplate, itemTemplate) {
        const dpRef = (0, compat_1.useRef)(dataProvider);
        const flatDpRef = (0, compat_1.useRef)(new FlattenedTreeDataProviderView(dataProvider, {
            expanded: new ojkeyset_1.AllKeySetImpl()
        }));
        if (dpRef.current != dataProvider) {
            dpRef.current = dataProvider;
            flatDpRef.current = new FlattenedTreeDataProviderView(dpRef.current, {
                expanded: new ojkeyset_1.AllKeySetImpl()
            });
        }
        const { data } = (0, useDataProvider_1.useDataProvider)({
            data: flatDpRef.current,
            addBusyState
        });
        const sections = [];
        if (data.length > 0) {
            let currentSection;
            for (const item of data) {
                const metaData = item.metadata;
                const context = {
                    key: metaData.key,
                    data: item.data,
                    index: item.metadata.indexFromParent
                };
                const isSection = metaData?.treeDepth === 0;
                if (isSection) {
                    currentSection = item;
                    // Cannot avoid this casting because this has to handle both
                    // D and S types in ArrayTreeDataProvider
                    let sectionData = item.data;
                    const items = [];
                    if (sectionTemplate) {
                        sectionData = (0, TemplateHandler_1.processNodeTemplate)(item, sectionTemplate, context, 'oj-c-legend-section');
                    }
                    sections.push({ ...sectionData, items });
                }
                else {
                    const itemContext = {
                        ...context,
                        parentKey: metaData?.parentKey,
                        parentData: currentSection?.data
                    };
                    const processedItem = itemTemplate
                        ? (0, TemplateHandler_1.processNodeTemplate)(item, itemTemplate, itemContext, 'oj-c-legend-item')
                        : item.data;
                    sections[sections.length - 1]['items'].push({
                        ...processedItem,
                        id: metaData?.key
                    });
                }
            }
        }
        const idToDPItemMap = new Map(data.map((item) => [item.key, item.data]));
        return {
            sections,
            idToDPItemMap
        };
    }
});
