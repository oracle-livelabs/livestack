/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import type { ContextType } from 'preact';
import type { Item } from 'ojs/ojdataprovider';
import type { CardViewReorderDetail } from '@oracle/oraclejet-preact/UNSAFE_CardFlexView';
import type { CurrentKeyDetail, SelectionDetail } from '@oracle/oraclejet-preact/UNSAFE_Collection';
import type { BusyStateContext } from '@oracle/oraclejet-preact/hooks/UNSAFE_useBusyStateContext';
import type { CardViewProps } from './card-view';
export declare const useCardViewPreact: <K extends string | number, D>({ "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, "aria-describedby": ariaDescribedBy, data: propData, gutterSize, focusBehavior, selected, onSelectedChanged, scrollPolicyOptions, selectionMode, initialAnimation, columns: corePackColumns, reorderable, onOjReorder, onCurrentItemChanged, skeletonTemplate }: Partial<CardViewProps<K, D>>, isClickthroughDisabled: (target: EventTarget | null) => boolean, busyStateContext: ContextType<typeof BusyStateContext>) => {
    status: "error" | "loading" | "success";
    cardViewProps: {
        'aria-label': string | undefined;
        'aria-labelledby': string | undefined;
        'aria-describedby': string | undefined;
        data: {
            data: D;
            metadata: import("@oracle/oraclejet-preact/UNSAFE_Collection").Metadata<K>;
        }[] | null;
        getRowKey: (data: Item<K, D>) => K;
        gutterSize: ("xs" | "sm" | "md" | "lg" | "xl") | undefined;
        hasMore: boolean;
        onLoadMore: () => void;
        focusBehavior: "content" | "card" | undefined;
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
        selectionMode: "none" | "multiple" | "single" | undefined;
        initialAnimation: "slideUp" | "slideDown" | undefined;
        columns: number;
        viewportConfig: import("@oracle/oraclejet-preact/hooks/UNSAFE_useViewportIntersect").ViewportConfig | undefined;
        onReorder: ((detail: CardViewReorderDetail<K>) => void) | undefined;
        onPersistCurrentItem: (detail: CurrentKeyDetail<K>) => void;
        skeletonRenderer: import("ojs/ojvcomponent").TemplateSlot<import("@oracle/oraclejet-preact/UNSAFE_CardFlexView").SkeletonRendererContext> | undefined;
    };
};
