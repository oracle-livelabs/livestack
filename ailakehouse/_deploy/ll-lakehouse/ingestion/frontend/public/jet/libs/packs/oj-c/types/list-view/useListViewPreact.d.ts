/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import type { Item } from 'ojs/ojdataprovider';
import type { CurrentKeyDetail, ItemActionDetail, SelectionDetail, Metadata } from '@oracle/oraclejet-preact/UNSAFE_Collection';
import type { ListViewReorderDetail } from '@oracle/oraclejet-preact/UNSAFE_ListView';
import type { ListViewProps } from './list-view';
export declare const useListViewPreact: <K extends string | number, D>({ "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, "aria-describedby": ariaDescribedBy, data: propData, gridlines, currentItemOverride, onCurrentItemChanged, selectionMode, selected, scrollPolicyOptions, onSelectedChanged, onOjItemAction, onOjFirstSelectedItem, reorderable, onOjReorder, item, skeletonTemplate }: Partial<ListViewProps<K, D>>, addBusyState: (desc?: string) => () => void, isClickthroughDisabled: (target: EventTarget | null) => boolean) => {
    status: "error" | "loading" | "success";
    listViewProps: {
        'aria-label': string | undefined;
        'aria-labelledby': string | undefined;
        'aria-describedby': string | undefined;
        data: {
            data: D;
            metadata: Metadata<K>;
        }[] | null;
        currentItemOverride: import("@oracle/oraclejet-preact/UNSAFE_Collection").Item<K> | undefined;
        getRowKey: (data: Item<K, D>) => K;
        gridlines: import("@oracle/oraclejet-preact/UNSAFE_ListView").Gridlines | undefined;
        onPersistCurrentItem: (detail: CurrentKeyDetail<K>) => void;
        hasMore: boolean;
        onLoadMore: () => void;
        onSelectionChange: (detail: SelectionDetail<K>) => void;
        selectedKeys: {
            all: true;
            keys?: never;
            deletedKeys: import("@oracle/oraclejet-preact/utils/UNSAFE_keys").ImmutableSet<K>;
        } | {
            all: false;
            keys: import("@oracle/oraclejet-preact/utils/UNSAFE_keys").ImmutableSet<K>;
            deletedKeys?: never;
        } | {
            all: false;
            keys: Set<K>;
        };
        selectionMode: "none" | "multiple" | "single" | "multipleToggle" | undefined;
        promotedSection: {
            count: number;
        };
        onItemAction: (detail: ItemActionDetail<K, Item<K, D>>) => void;
        onReorder: ((detail: ListViewReorderDetail<K>) => void) | undefined;
        viewportConfig: import("@oracle/oraclejet-preact/hooks/UNSAFE_useViewportIntersect").ViewportConfig | undefined;
        itemPadding: "disabled" | "enabled" | import("@oracle/oraclejet-preact/UNSAFE_ListView").ItemPadding | undefined;
        itemEnterKeyFocusBehavior: "none" | "focusWithin" | undefined;
        skeletonRenderer: import("ojs/ojvcomponent").TemplateSlot<import("@oracle/oraclejet-preact/UNSAFE_ListView").SkeletonRendererContext> | undefined;
    };
};
