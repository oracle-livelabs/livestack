/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { AccordionItemSingle as PreactAccordionItemSingle } from '@oracle/oraclejet-preact/UNSAFE_AccordionItemSingle';
import { ComponentProps, ComponentChildren } from 'preact';
import { ExtendGlobalProps, ObservedGlobalProps, PropertyChanged, Slot, Action } from 'ojs/ojvcomponent';
type PreactAccordionItemSingleProps = ComponentProps<typeof PreactAccordionItemSingle>;
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
 *       <td>K | undefined</td>
 *       <td>The key of the item that was previously expanded.</td>
 *     </tr>
 *     <tr>
 *       <td>to</td>
 *       <td>K | null</td>
 *       <td>The key of the item that is now expanded.</td>
 *     </tr>
 *   </tbody>
 * </table>
 */
type AccordionItemSingleDetail<K extends string | number> = {
    fromKey?: K;
    toKey: K | null;
};
type Props<K extends string | number> = ObservedGlobalProps<'aria-label'> & {
    /**
     * @description
     * Specifies the item key of each AccordionItemSingle.
     * Use <code>itemKey</code> to uniquely identify each item in the accordion.
     *
     * @ojmetadata description "Specifies the item key of each AccordionItemSingle."
     * @ojmetadata displayName "Item Key"
     * @ojmetadata help "#itemKey"
     */
    itemKey?: K;
    /**
     * @description
     * Specifies the expandedKey property.
     * Use <code>expandedKey</code> to control which item is expanded.
     * Bind this property to an observable in your ViewModel (e.g., <code>ko.Observable&lt;string | null&gt;</code>) to programmatically expand/collapse items.
     *
     * @ojmetadata description "Specifies the expandedKey."
     * @ojmetadata displayName "Expanded Key"
     * @ojmetadata help "#expandedKey"
     */
    expandedKey?: K | null;
    /**
     * @description
     * Writeback support for the expandedKey property.
     * Use <code>onExpandedKeyChanged</code> to handle changes to the expandedKey property. This callback is triggered when the expanded item changes.
     *
     * @ojmetadata description "Writeback support for the expandedKey property"
     * @ojmetadata displayName "Expanded Key Changed"
     * @ojmetadata help "#expandedKey"
     */
    onExpandedKeyChanged?: PropertyChanged<K | null>;
    /**
     * Item's header. If not specified, the header contains only an open/close icon.
     * The header text is required for accessibility purposes.
     *
     * @ojmetadata description "Collapsible's header. If not specified, the header contains only an open/close icon. The header text is required for accessibility purposes."
     * @ojmetadata displayName "Header"
     * @ojmetadata help "#header"
     */
    header?: Slot;
    /**
     * The content node to be expanded or collapsed.
     * Place any content to be shown/hidden inside this property.
     *
     * @ojmetadata description "Collapsible's content node. Place any content to be shown/hidden inside this property."
     * @ojmetadata displayName "Content"
     * @ojmetadata help "#children"
     */
    children: ComponentChildren;
    /**
     * Disables the item if set to true.
     *
     * @ojmetadata description "Disables the collapsible if set to true."
     * @ojmetadata displayName "Disabled"
     * @ojmetadata help "#disabled"
     */
    disabled?: PreactAccordionItemSingleProps['isDisabled'];
    /**
     * Changes chevron icon placement at the end of the collapsible header.
     *
     * @ojmetadata description "Changes chevron icon placement at the end of the collapsible header."
     * @ojmetadata displayName "Icon Position"
     * @ojmetadata help "#iconPosition"
     */
    iconPosition?: PreactAccordionItemSingleProps['iconPosition'];
    /**
     * @ojmetadata description "Triggered after the item has been collapsed (after animation completes)."
     * @ojmetadata help "#event:collapse"
     */
    onOjCollapse?: Action<AccordionItemSingleDetail<K>>;
    /**
     * @ojmetadata description "Triggered after the item has been expanded (after animation completes)."
     * @ojmetadata help "#event:expand"
     */
    onOjExpand?: Action<AccordionItemSingleDetail<K>>;
};
/**
 * @classdesc
 * <h3 id="AccordionItemSingleOverview-section">
 *   JET AccordionItemSingle
 *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#AccordionItemSingleOverview-section"></a>
 * </h3>
 * <p>Description: The <code>oj-c-accordion-item-single</code> component renders collapsible content in a group, supporting single expansion mode (only one item expanded at a time). Use <code>itemKey</code> and <code>expandedKey</code> to control and identify expanded items. Event handlers <code>onOjExpand</code> and <code>onOjCollapse</code> provide callbacks for responding to expansion and collapse events.</p>
 * <p>This component is typically used in Layout & Nav scenarios, such as within templates for Table, ListView, or CardView. It supports accessibility via the <code>aria-label</code> attribute and requires header text for screen readers.</p>
 *
 * <pre class="prettyprint"><code>
 * &lt;oj-c-accordion-item-single
 *    item-key="item1"
 *    expanded-key="[[expanded]]"
 *    on-oj-expand="[[expandHandler]]"
 *    on-oj-collapse="[[collapseHandler]]"
 *    aria-label="Details for Item 1"
 * &gt;
 *   &lt;h3 slot="header"&gt;Item 1&lt;/h3&gt;
 *   &lt;div&gt;Content for Item 1&lt;/div&gt;
 * &lt;/oj-c-accordion-item-single&gt;
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
 *
 * @typeparam K Type extends string or number
 * @ojmetadata description "An accordion item single component renders collapsible content in a group to support single expansion, when only one of the items in the group can be expanded at a time."
 * @ojmetadata displayName "AccordionItemSingle"
 * @ojmetadata extension {
 *   "catalog": {
 *     "category": "Layout & Nav"
 *   },
 *   "vbdt": {
 *     "module": "oj-c/accordion-item-single"
 *   }
 * }
 * @ojmetadata help "oj-c.AccordionItemSingle.html"
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
declare const AccordionItemSingleImpl: <K extends string | number>({ itemKey, expandedKey, onExpandedKeyChanged, children, ...otherProps }: Props<K>) => import("preact").JSX.Element;
/**
 * This export corresponds to the AccordionItemSingle Preact component. For the oj-c-accordion-item-single custom element, import CAccordionItemSingleElement instead.
 */
export declare const AccordionItemSingle: <K extends string | number = string | number>(props: ExtendGlobalProps<ComponentProps<typeof AccordionItemSingleImpl<K>>>) => ComponentChildren;
export {};
import { JetElement, JetSettableProperties, JetElementCustomEventStrict, JetSetPropertyType } from 'ojs/index';
import { GlobalProps } from 'ojs/ojvcomponent';
import 'ojs/oj-jsx-interfaces';
/**
 * This export corresponds to the oj-c-accordion-item-single custom element. For the AccordionItemSingle Preact component, import AccordionItemSingle instead.
 */
export interface CAccordionItemSingleElement<K extends string | number> extends JetElement<CAccordionItemSingleElementSettableProperties<K>>, CAccordionItemSingleElementSettableProperties<K> {
    addEventListener<T extends keyof CAccordionItemSingleElementEventMap<K>>(type: T, listener: (this: HTMLElement, ev: CAccordionItemSingleElementEventMap<K>[T]) => any, options?: (boolean | AddEventListenerOptions)): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: (boolean | AddEventListenerOptions)): void;
    getProperty<T extends keyof CAccordionItemSingleElementSettableProperties<K>>(property: T): CAccordionItemSingleElement<K>[T];
    getProperty(property: string): any;
    setProperty<T extends keyof CAccordionItemSingleElementSettableProperties<K>>(property: T, value: CAccordionItemSingleElementSettableProperties<K>[T]): void;
    setProperty<T extends string>(property: T, value: JetSetPropertyType<T, CAccordionItemSingleElementSettableProperties<K>>): void;
    setProperties(properties: CAccordionItemSingleElementSettablePropertiesLenient<K>): void;
}
export namespace CAccordionItemSingleElement {
    interface ojCollapse<K extends string | number> extends CustomEvent<AccordionItemSingleDetail<K> & {}> {
    }
    interface ojExpand<K extends string | number> extends CustomEvent<AccordionItemSingleDetail<K> & {}> {
    }
    type disabledChanged<K extends string | number> = JetElementCustomEventStrict<CAccordionItemSingleElement<K>['disabled']>;
    type expandedKeyChanged<K extends string | number> = JetElementCustomEventStrict<CAccordionItemSingleElement<K>['expandedKey']>;
    type iconPositionChanged<K extends string | number> = JetElementCustomEventStrict<CAccordionItemSingleElement<K>['iconPosition']>;
    type itemKeyChanged<K extends string | number> = JetElementCustomEventStrict<CAccordionItemSingleElement<K>['itemKey']>;
}
export interface CAccordionItemSingleElementEventMap<K extends string | number> extends HTMLElementEventMap {
    'ojCollapse': CAccordionItemSingleElement.ojCollapse<K>;
    'ojExpand': CAccordionItemSingleElement.ojExpand<K>;
    'disabledChanged': JetElementCustomEventStrict<CAccordionItemSingleElement<K>['disabled']>;
    'expandedKeyChanged': JetElementCustomEventStrict<CAccordionItemSingleElement<K>['expandedKey']>;
    'iconPositionChanged': JetElementCustomEventStrict<CAccordionItemSingleElement<K>['iconPosition']>;
    'itemKeyChanged': JetElementCustomEventStrict<CAccordionItemSingleElement<K>['itemKey']>;
}
export interface CAccordionItemSingleElementSettableProperties<K extends string | number> extends JetSettableProperties {
    /**
     * Disables the item if set to true.
     */
    disabled?: Props<K>['disabled'];
    /**
     * Specifies the expandedKey property.
     * Use <code>expandedKey</code> to control which item is expanded.
     * Bind this property to an observable in your ViewModel (e.g., <code>ko.Observable&lt;string | null&gt;</code>) to programmatically expand/collapse items.
     */
    expandedKey?: Props<K>['expandedKey'];
    /**
     * Changes chevron icon placement at the end of the collapsible header.
     */
    iconPosition?: Props<K>['iconPosition'];
    /**
     * Specifies the item key of each AccordionItemSingle.
     * Use <code>itemKey</code> to uniquely identify each item in the accordion.
     */
    itemKey?: Props<K>['itemKey'];
}
export interface CAccordionItemSingleElementSettablePropertiesLenient<K extends string | number> extends Partial<CAccordionItemSingleElementSettableProperties<K>> {
    [key: string]: any;
}
export interface AccordionItemSingleIntrinsicProps extends Partial<Readonly<CAccordionItemSingleElementSettableProperties<any>>>, GlobalProps, Pick<preact.JSX.HTMLAttributes, 'ref' | 'key'> {
    children?: import('preact').ComponentChildren;
    onojCollapse?: (value: CAccordionItemSingleElementEventMap<any>['ojCollapse']) => void;
    onojExpand?: (value: CAccordionItemSingleElementEventMap<any>['ojExpand']) => void;
    ondisabledChanged?: (value: CAccordionItemSingleElementEventMap<any>['disabledChanged']) => void;
    onexpandedKeyChanged?: (value: CAccordionItemSingleElementEventMap<any>['expandedKeyChanged']) => void;
    oniconPositionChanged?: (value: CAccordionItemSingleElementEventMap<any>['iconPositionChanged']) => void;
    onitemKeyChanged?: (value: CAccordionItemSingleElementEventMap<any>['itemKeyChanged']) => void;
}
declare global {
    namespace preact.JSX {
        interface IntrinsicElements {
            'oj-c-accordion-item-single': AccordionItemSingleIntrinsicProps;
        }
    }
}
