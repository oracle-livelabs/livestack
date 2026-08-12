/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { ContextMenuItems } from '../../utils/PRIVATE_ItemsMenu/items-menu';
import { Action, Bubbles } from 'ojs/ojvcomponent';
export type ContextMenuConfig<C> = {
    accessibleLabel?: string;
    items: (context: C) => Array<ContextMenuItems>;
};
export type ContextMenuSelectionDetail<C> = {
    value: string | Array<string>;
    contextMenuContext: C;
    menuSelectionGroupKey: string;
};
export type ContextMenuActionDetail<C> = {
    menuItemKey: string;
    contextMenuContext: C;
};
export declare function useVisContextMenu<K extends string | number, D, CorepackContext extends {
    type: string;
}, PreactContext extends {
    type: string;
    [key: string]: any;
}>(idToDPItemMap: Map<K, D>, contextMenuConfig?: ContextMenuConfig<CorepackContext>, onOjContextMenuAction?: Action<ContextMenuActionDetail<CorepackContext>> & Bubbles, onOjContextMenuSelection?: Action<ContextMenuSelectionDetail<CorepackContext>> & Bubbles, transformContext?: (context: PreactContext) => CorepackContext): {
    preactContextMenuConfig: {
        itemsRenderer: (context: PreactContext) => import("preact").JSX.Element;
        accessibleLabel: string | undefined;
    };
};
