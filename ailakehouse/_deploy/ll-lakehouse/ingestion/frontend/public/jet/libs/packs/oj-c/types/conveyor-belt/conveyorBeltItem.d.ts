/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
/**
 * Internal sub-component for core pack list-view also serves as context provider for tabbable mode
 */
import { TemplateSlot } from 'ojs/ojvcomponent';
export type ConveyorBeltItemContext<K, D> = {
    /**
     * zero based index of the item
     */
    key: K;
    /**
     * data for the item
     */
    data: D;
};
type ConveyorBeltItemProps<K extends string | number, D> = {
    context: ConveyorBeltItemContext<K, D>;
    itemTemplate: TemplateSlot<ConveyorBeltItemContext<K, D>>;
};
export declare const ConveyorBeltItem: <K extends string | number, D>({ context, itemTemplate }: ConveyorBeltItemProps<K, D>) => import("preact").JSX.Element;
export {};
