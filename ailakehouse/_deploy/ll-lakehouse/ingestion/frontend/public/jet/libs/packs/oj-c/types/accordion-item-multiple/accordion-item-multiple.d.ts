/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { AccordionItemMultiple as PreactAccordionItemMultiple } from '@oracle/oraclejet-preact/UNSAFE_AccordionItemMultiple';
import { ComponentProps, ComponentChildren } from 'preact';
import { ExtendGlobalProps, ObservedGlobalProps, PropertyChanged, Slot, Action } from 'ojs/ojvcomponent';
type PreactAccordionItemMultipleProps = ComponentProps<typeof PreactAccordionItemMultiple>;
/**
 * Payload for the onOjCollapse event and onOjExpand event.
 * <p>All of the event payloads listed below can be found under <code>event.detail</code>. See Events and Listeners for additional information.</p>
 *
 * <table>
 *   <thead>
 *     <tr>
 *       <th>Name</th>
 *       <th>Type</th>
 *       <th>Description</th>
 *     </tr>
 *   </thead>
 *   <tbody>
 *     <tr>
 *       <td>from</td>
 *       <td>Array&lt;K&gt; | undefined</td>
 *       <td>The keys of the items that were previously expanded.</td>
 *     </tr>
 *     <tr>
 *       <td>to</td>
 *       <td>Array&lt;K&gt; | null</td>
 *       <td>The keys of the items that are now expanded.</td>
 *     </tr>
 *   </tbody>
 * </table>
 */
type AccordionItemMultipleDetail<K extends string | number> = {
    fromKeys?: Array<K>;
    toKeys: Array<K> | null;
};
type Props<K extends string | number> = ObservedGlobalProps<'aria-label'> & {
    /**
     * @description
     * Specifies the item key of each AccordionItemMultiple.
     * Use <code>itemKey</code> to uniquely identify each item in the accordion.
     *
     * @ojmetadata description "Specifies the item key of each AccordionItemMultiple."
     * @ojmetadata displayName "Item Key"
     * @ojmetadata help "#itemKey"
     */
    itemKey?: K;
    /**
     * @description
     * Specifies the expandedKeys property.
     * Use <code>expandedKeys</code> to control which items are expanded.
     * Bind this property to an observable array in your ViewModel (e.g., <code>ko.ObservableArray&lt;string&gt;</code>) to programmatically expand/collapse items.
     *
     * @ojmetadata description "Specifies the expandedKeys."
     * @ojmetadata displayName "Expanded Keys"
     * @ojmetadata help "#expandedKeys"
     */
    expandedKeys: Array<K>;
    /**
     * @description
     * Writeback support for the expandedKeys property.
     * Use <code>onExpandedKeysChanged</code> to handle changes to the expandedKeys property. This callback is triggered when the expanded items change.
     *
     * @ojmetadata description "Writeback support for the expandedKeys property"
     * @ojmetadata displayName "Expanded Keys Changed"
     * @ojmetadata help "#expandedKeys"
     */
    onExpandedKeysChanged?: PropertyChanged<Array<K>>;
    /**
     * Item's header. If not specified, the header contains only an open/close icon.
     * The header text is required for accessibility purposes.
     *
     * @ojmetadata description "Item's header. If not specified, the header contains only an open/close icon. The header text is required for accessibility purposes."
     * @ojmetadata displayName "Header"
     * @ojmetadata help "#header"
     */
    header?: Slot;
    /**
     * The content node to be expanded or collapsed.
     * Place any content to be shown/hidden inside this property.
     *
     * @ojmetadata description "Item's content node. Place any content to be shown/hidden inside this property."
     * @ojmetadata displayName "Content"
     * @ojmetadata help "#children"
     */
    children: ComponentChildren;
    /**
     * Disables the item if set to true.
     *
     * @ojmetadata description "Disables the item if set to true."
     * @ojmetadata displayName "Disabled"
     * @ojmetadata help "#disabled"
     */
    disabled?: PreactAccordionItemMultipleProps['isDisabled'];
    /**
     * Changes chevron icon placement at the end of the collapsible header.
     *
     * @ojmetadata description "Changes chevron icon placement at the end of the collapsible header."
     * @ojmetadata displayName "Icon Position"
     * @ojmetadata help "#iconPosition"
     */
    iconPosition?: PreactAccordionItemMultipleProps['iconPosition'];
    /**
     * @ojmetadata description "Triggered after the item has been collapsed (after animation completes)."
     * @ojmetadata help "#event:collapse"
     */
    onOjCollapse?: Action<AccordionItemMultipleDetail<K>>;
    /**
     * @ojmetadata description "Triggered after the item has been expanded (after animation completes)."
     * @ojmetadata help "#event:expand"
     */
    onOjExpand?: Action<AccordionItemMultipleDetail<K>>;
};
/**
 * @classdesc
 * <h3 id="AccordionItemMultipleOverview-section">
 *   JET AccordionItemMultiple
 *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#AccordionItemMultipleOverview-section"></a>
 * </h3>
 * <p>Description: The <code>oj-c-accordion-item-multiple</code> component renders collapsible content in a group, supporting multiple expansion mode (multiple items can be expanded at once). Use <code>itemKey</code> and <code>expandedKeys</code> to control and identify expanded items. Event handlers <code>onOjExpand</code> and <code>onOjCollapse</code> provide callbacks for responding to expansion and collapse events.</p>
 * <p>This component is typically used in Layout & Nav scenarios, such as within templates for Table, ListView, or CardView. It supports accessibility via the <code>aria-label</code> attribute and requires header text for screen readers.</p>
 *
 * <pre class="prettyprint"><code>
 * &lt;oj-c-accordion-item-multiple
 *    item-key="item1"
 *    expanded-keys="[[expandedKeys]]"
 *    on-oj-expand="[[expandHandler]]"
 *    on-oj-collapse="[[collapseHandler]]"
 *    aria-label="Details for Item 1"
 * &gt;
 *   &lt;h3 slot="header"&gt;Item 1&lt;/h3&gt;
 *   &lt;div&gt;Content for Item 1&lt;/div&gt;
 * &lt;/oj-c-accordion-item-multiple&gt;
 * </code></pre>
 *
 * <h3 id="a11y-section">Accessibility</h3>
 * <p>Specify a value for the <code>aria-label</code> attribute with a meaningful description of the purpose of this accordion item for accessibility. Header text is required for screen readers.</p>
 *
 * <h3 id="keyboard-section">Keyboard End User Information</h3>
 * <ul>
 *   <li><kbd>Enter/Space</kbd>: Toggle expansion/collapse of the item.</li>
 *   <li><kbd>Tab</kbd>: Move focus to the next tabbable element.</li>
 * </ul>
 *
 * <h3 id="touch-section">Touch End User Information</h3>
 * <ul>
 *   <li><b>Tap</b> on header: Toggle expansion/collapse of the item.</li>
 * </ul>
 *
 * <h3 id="validation-section">Validation and Messaging</h3>
 * <p>This component does not support validation or messaging directly. Use parent form components for validation if needed.</p>
 *
 * <h3 id="user-assistance-text-section">User Assistance Text</h3>
 * <p>Provide clear header text and aria-labels for accessibility and user guidance.</p>
 *
 * @typeparam K Type extends string or number
 * @ojmetadata description "An accordion item multiple component renders collapsible content in a group to support multiple expansion, when more than one of the items in the group can be expanded at a time."
 * @ojmetadata displayName "AccordionItemMultiple"
 * @ojmetadata extension {
 *   "catalog": {
 *     "category": "Layout & Nav"
 *   },
 *   "vbdt": {
 *     "module": "oj-c/accordion-item-multiple"
 *   }
 * }
 * @ojmetadata help "oj-c.AccordionItemMultiple.html"
 * @ojmetadata since "20.0.0"
 * @ojmetadata main "oj-c/accordion-item-single"
 * @ojmetadata status [
 *   {
 *     "type": "supersedes",
 *     "since": "20.0.0",
 *     "value": ["oj-accordion"]
 *   }
 * ]
 */
declare const AccordionItemMultipleImpl: <K extends string | number>({ itemKey, expandedKeys, onExpandedKeysChanged, children, ...otherProps }: Props<K>) => import("preact").JSX.Element;
/**
 * This export corresponds to the AccordionItemMultiple Preact component. For the oj-c-accordion-item-multiple custom element, import CAccordionItemMultipleElement instead.
 */
export declare const AccordionItemMultiple: <K extends string | number = string | number>(props: ExtendGlobalProps<ComponentProps<typeof AccordionItemMultipleImpl<K>>>) => ComponentChildren;
export {};
import { JetElement, JetSettableProperties, JetElementCustomEventStrict, JetSetPropertyType } from 'ojs/index';
import { GlobalProps } from 'ojs/ojvcomponent';
import 'ojs/oj-jsx-interfaces';
/**
 * This export corresponds to the oj-c-accordion-item-multiple custom element. For the AccordionItemMultiple Preact component, import AccordionItemMultiple instead.
 */
export interface CAccordionItemMultipleElement<K extends string | number> extends JetElement<CAccordionItemMultipleElementSettableProperties<K>>, CAccordionItemMultipleElementSettableProperties<K> {
    addEventListener<T extends keyof CAccordionItemMultipleElementEventMap<K>>(type: T, listener: (this: HTMLElement, ev: CAccordionItemMultipleElementEventMap<K>[T]) => any, options?: (boolean | AddEventListenerOptions)): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: (boolean | AddEventListenerOptions)): void;
    getProperty<T extends keyof CAccordionItemMultipleElementSettableProperties<K>>(property: T): CAccordionItemMultipleElement<K>[T];
    getProperty(property: string): any;
    setProperty<T extends keyof CAccordionItemMultipleElementSettableProperties<K>>(property: T, value: CAccordionItemMultipleElementSettableProperties<K>[T]): void;
    setProperty<T extends string>(property: T, value: JetSetPropertyType<T, CAccordionItemMultipleElementSettableProperties<K>>): void;
    setProperties(properties: CAccordionItemMultipleElementSettablePropertiesLenient<K>): void;
}
export namespace CAccordionItemMultipleElement {
    interface ojCollapse<K extends string | number> extends CustomEvent<AccordionItemMultipleDetail<K> & {}> {
    }
    interface ojExpand<K extends string | number> extends CustomEvent<AccordionItemMultipleDetail<K> & {}> {
    }
    type disabledChanged<K extends string | number> = JetElementCustomEventStrict<CAccordionItemMultipleElement<K>['disabled']>;
    type expandedKeysChanged<K extends string | number> = JetElementCustomEventStrict<CAccordionItemMultipleElement<K>['expandedKeys']>;
    type iconPositionChanged<K extends string | number> = JetElementCustomEventStrict<CAccordionItemMultipleElement<K>['iconPosition']>;
    type itemKeyChanged<K extends string | number> = JetElementCustomEventStrict<CAccordionItemMultipleElement<K>['itemKey']>;
}
export interface CAccordionItemMultipleElementEventMap<K extends string | number> extends HTMLElementEventMap {
    'ojCollapse': CAccordionItemMultipleElement.ojCollapse<K>;
    'ojExpand': CAccordionItemMultipleElement.ojExpand<K>;
    'disabledChanged': JetElementCustomEventStrict<CAccordionItemMultipleElement<K>['disabled']>;
    'expandedKeysChanged': JetElementCustomEventStrict<CAccordionItemMultipleElement<K>['expandedKeys']>;
    'iconPositionChanged': JetElementCustomEventStrict<CAccordionItemMultipleElement<K>['iconPosition']>;
    'itemKeyChanged': JetElementCustomEventStrict<CAccordionItemMultipleElement<K>['itemKey']>;
}
export interface CAccordionItemMultipleElementSettableProperties<K extends string | number> extends JetSettableProperties {
    /**
     * Disables the item if set to true.
     */
    disabled?: Props<K>['disabled'];
    /**
     * Specifies the expandedKeys property.
     * Use <code>expandedKeys</code> to control which items are expanded.
     * Bind this property to an observable array in your ViewModel (e.g., <code>ko.ObservableArray&lt;string&gt;</code>) to programmatically expand/collapse items.
     */
    expandedKeys: Props<K>['expandedKeys'];
    /**
     * Changes chevron icon placement at the end of the collapsible header.
     */
    iconPosition?: Props<K>['iconPosition'];
    /**
     * Specifies the item key of each AccordionItemMultiple.
     * Use <code>itemKey</code> to uniquely identify each item in the accordion.
     */
    itemKey?: Props<K>['itemKey'];
}
export interface CAccordionItemMultipleElementSettablePropertiesLenient<K extends string | number> extends Partial<CAccordionItemMultipleElementSettableProperties<K>> {
    [key: string]: any;
}
export interface AccordionItemMultipleIntrinsicProps extends Partial<Readonly<CAccordionItemMultipleElementSettableProperties<any>>>, GlobalProps, Pick<preact.JSX.HTMLAttributes, 'ref' | 'key'> {
    children?: import('preact').ComponentChildren;
    onojCollapse?: (value: CAccordionItemMultipleElementEventMap<any>['ojCollapse']) => void;
    onojExpand?: (value: CAccordionItemMultipleElementEventMap<any>['ojExpand']) => void;
    ondisabledChanged?: (value: CAccordionItemMultipleElementEventMap<any>['disabledChanged']) => void;
    onexpandedKeysChanged?: (value: CAccordionItemMultipleElementEventMap<any>['expandedKeysChanged']) => void;
    oniconPositionChanged?: (value: CAccordionItemMultipleElementEventMap<any>['iconPositionChanged']) => void;
    onitemKeyChanged?: (value: CAccordionItemMultipleElementEventMap<any>['itemKeyChanged']) => void;
}
declare global {
    namespace preact.JSX {
        interface IntrinsicElements {
            'oj-c-accordion-item-multiple': AccordionItemMultipleIntrinsicProps;
        }
    }
}
