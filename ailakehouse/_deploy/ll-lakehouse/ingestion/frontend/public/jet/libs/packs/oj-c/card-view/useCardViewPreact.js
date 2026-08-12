define(["require", "exports", "preact/hooks", "../hooks/UNSAFE_useListData/useListData", "../hooks/PRIVATE_useViewportConfig/useViewportConfig", "../utils/PRIVATE_collectionUtils/collectionUtils"], function (require, exports, hooks_1, useListData_1, useViewportConfig_1, collectionUtils_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.useCardViewPreact = void 0;
    const useCardViewPreact = ({ 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy, data: propData, gutterSize, focusBehavior, selected, onSelectedChanged, scrollPolicyOptions, selectionMode, initialAnimation, columns: corePackColumns, reorderable, onOjReorder, onCurrentItemChanged, skeletonTemplate }, isClickthroughDisabled, busyStateContext) => {
        const [listDataState, onLoadRange] = (0, useListData_1.useListData)(propData, {
            fetchSize: scrollPolicyOptions?.fetchSize
        });
        const resolveBusyState = (0, hooks_1.useRef)();
        const listData = listDataState.data;
        // set and resolve busy state based on listDataState
        (0, hooks_1.useEffect)(() => {
            if (listDataState.status === 'loading') {
                resolveBusyState.current = busyStateContext.addBusyState('list data is in fetch state');
            }
            else {
                if (resolveBusyState.current) {
                    resolveBusyState.current();
                    resolveBusyState.current = undefined;
                }
            }
        }, [listDataState.status, busyStateContext]);
        // when the component is unmount, we should clear busy state also
        (0, hooks_1.useEffect)(() => {
            return () => {
                if (resolveBusyState.current) {
                    resolveBusyState.current();
                    resolveBusyState.current = undefined;
                }
            };
        }, []);
        // in core pack side, columns could be a number or 'auto' or undefined
        // in preact side, columns could only be number or undefined
        const numberCorepackColumns = Number(corePackColumns);
        const preactColumns = Number.isInteger(numberCorepackColumns) ? numberCorepackColumns : 0;
        const selectedKeys = (0, collectionUtils_1.getSelectedKeys)(selected, listData, selectionMode, onSelectedChanged);
        const handleOnSelectionChange = (detail) => {
            (0, collectionUtils_1.handleOnSelectionChanged)(selectionMode, detail, onSelectedChanged, isClickthroughDisabled);
        };
        const { viewportConfig } = (0, useViewportConfig_1.useViewportConfig)(scrollPolicyOptions);
        const getRowKey = (data) => {
            return data.metadata.key;
        };
        const onLoadMore = (0, hooks_1.useCallback)(() => {
            if (listData) {
                const fetchSize = scrollPolicyOptions && scrollPolicyOptions.fetchSize ? scrollPolicyOptions.fetchSize : 25;
                onLoadRange({ offset: 0, count: listData.data.length + fetchSize });
            }
        }, [listData, scrollPolicyOptions, onLoadRange]);
        const handleOnCurrentItemChanged = (detail) => {
            onCurrentItemChanged?.(detail.value);
        };
        return {
            status: listDataState.status,
            cardViewProps: {
                'aria-label': ariaLabel,
                'aria-labelledby': ariaLabelledBy,
                'aria-describedby': ariaDescribedBy,
                data: listData ? listData.data : null,
                getRowKey,
                gutterSize,
                hasMore: listData ? listData.sizePrecision === 'atLeast' : false,
                onLoadMore,
                focusBehavior,
                onSelectionChange: handleOnSelectionChange,
                selectedKeys,
                selectionMode: selectionMode === 'singleRequired' ? 'single' : selectionMode,
                initialAnimation,
                columns: preactColumns,
                // in preact layer, the data is a type of Item in ItemActionDetail
                viewportConfig,
                onReorder: reorderable?.items === 'enabled'
                    ? (detail) => {
                        onOjReorder && onOjReorder(detail);
                    }
                    : undefined,
                onPersistCurrentItem: handleOnCurrentItemChanged,
                skeletonRenderer: skeletonTemplate
            }
        };
    };
    exports.useCardViewPreact = useCardViewPreact;
});
