/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { ComponentProps, ComponentType } from 'preact';
import { PictoChart as PreactPictoChart } from '@oracle/oraclejet-preact/UNSAFE_PictoChart';
import 'css!oj-c/picto-chart/picto-chart-styles.css';
import { DataProvider } from 'ojs/ojdataprovider';
import type { PictoChartItemProps } from '../picto-chart-item/picto-chart-item';
import { Action, Bubbles, ExtendGlobalProps, ObservedGlobalProps, PropertyChanged, TemplateSlot } from 'ojs/ojvcomponent';
import { type ContextMenuConfig, type ContextMenuSelectionDetail, type ContextMenuActionDetail } from 'oj-c/hooks/PRIVATE_useVisContextMenu/useVisContextMenu';
type PreactPictoChartProps = ComponentProps<typeof PreactPictoChart>;
export type Item<K> = {
    /**
     * @description
     * The item id should be set by the application if the DataProvider is not being used. The row key will be used as id in the DataProvider case.
     */
    id: K;
} & PictoChartItemProps;
export type PictoChartItemTemplateContext<K, D> = {
    /**
     * @description
     * The data object of the current item.
     */
    data: D;
    /**
     * @description
     * The key of the current item.
     */
    key: K;
    /**
     * @description
     * The zero-based index of the current item.
     */
    index: number;
};
export type PictochartContextMenuContext<K, D> = {
    /**
     * The shaped data of the item.
     */
    data?: Item<K>;
    /**
     * The data of the item from the data provider.
     */
    itemData?: D;
    type: 'item';
} | {
    type: 'background';
};
export type PictoChartContextMenuConfig<K, D> = ContextMenuConfig<PictochartContextMenuContext<K, D>>;
type DrillDetail<K> = {
    /**
     * The id of the drilled item
     * @ojmetadata description "The id of the drilled item."
     */
    id: K;
};
type PictoChartContextMenuSelectionDetail<K, D> = ContextMenuSelectionDetail<PictochartContextMenuContext<K, D>>;
type PictoChartContextMenuActionDetail<K, D> = ContextMenuActionDetail<PictochartContextMenuContext<K, D>>;
export type PictoChartProps<K, D extends Item<K> | any> = ObservedGlobalProps<'aria-label' | 'aria-labelledby' | 'aria-describedby'> & {
    /**
     * @description
     * Specifies the DataProvider for the sections and items of the picto-chart.
     * @ojmetadata description "Specifies the DataProvider for the sections and items of the picto-chart"
     * @ojmetadata displayName "Data"
     * @ojmetadata help "#data"
     */
    data: DataProvider<K, D> | null;
    /**
     * @description
     * An array of category strings used for highlighting. Data items matching categories in this array will be highlighted.
     * @ojmetadata description "An array of categories that will be hidden."
     * @ojmetadata displayName "Hidden Categories"
     * @ojmetadata help "#hiddenCategories"
     */
    hiddenCategories?: string[];
    /**
     * @description
     * The matching condition for the highlightedCategories property. By default, highlightMatch is 'all' and only items whose categories match all of the values specified in the highlightedCategories array will be highlighted. If highlightMatch is 'any', then items that match at least one of the highlightedCategories values will be highlighted.
     * @ojmetadata description " The matching condition for the highlightedCategories option. By default, highlightMatch is 'all' and only items whose categories match all of the values specified in the highlightedCategories array will be highlighted. If highlightMatch is 'any', then items that match at least one of the highlightedCategories values will be highlighted."
     * @ojmetadata displayName "Highlight Match"
     * @ojmetadata help "#highlightMatch"
     */
    highlightMatch?: 'any' | 'all';
    /**
     * @ojmetadata description Writeback support for the highlightedCategories property
     * @ojmetadata displayName "Highlighted Categories"
     * @ojmetadata help "#highlightedCategories"
     */
    onHiddenCategoriesChanged?: PropertyChanged<string[]>;
    /**
     * @description
     * An array of categories that will be highlighted.
     * @ojmetadata description "An array of categories that will be highlighted."
     * @ojmetadata displayName "Highlighted Categories"
     * @ojmetadata help "#highlightedCategories"
     */
    highlightedCategories?: string[];
    /**
     * @ojmetadata description Writeback support for the highlightedCategories property
     * @ojmetadata displayName "Highlighted Categories"
     * @ojmetadata help "#highlightedCategories"
     */
    onHighlightedCategoriesChanged?: PropertyChanged<string[]>;
    /**
     * @description
     * The behavior applied when hovering over data items.
     * @ojmetadata description "Defines the behavior applied when hovering over data items."
     * @ojmetadata displayName "Hover Behavior"
     * @ojmetadata help "#hoverBehavior"
     * @ojmetadata propertyEditorValues {
     *     "dim": {
     *       "description": "Dimming hover behavior is applied.",
     *       "displayName": "Dim"
     *     },
     *     "none": {
     *       "description": "No hover behavior will be applied.",
     *       "displayName": "None"
     *     }
     *   }
     */
    hoverBehavior?: 'dim' | 'none';
    /**
     * @description
     * The direction in which the items are laid out.
     * @ojmetadata description "The direction in which the items are laid out."
     * @ojmetadata displayName "Layout"
     * @ojmetadata help "#layout"
     * @ojmetadata propertyEditorValues {
     *     "vertical": {
     *       "description": "Items will be vertically placed in available space.",
     *       "displayName": "Vertical"
     *     },
     *     "horizontal": {
     *       "description": "Items will be horizontally stacked.",
     *       "displayName": "Horizontal"
     *     }
     *   }
     */
    layout?: PreactPictoChartProps['layout'];
    /**
     * @description
     * Whether drilling is enabled. Drillable items will show a pointer cursor on hover and fire an ojDrill event on click (double click if selection is enabled). To enable or disable drilling on individual items, use the drilling attribute in each item.
     * @ojmetadata description "Drillable items will show a pointer cursor on hover and fire an ojDrill event on click (double click if selection is enabled)."
     * @ojmetadata displayName "Drilling"
     * @ojmetadata help "#drilling"
     */
    drilling?: 'on' | 'off';
    /**
     * @description
     * Defines where the first item is rendered. The subsequent items follow the first item according to the layout.
     * @ojmetadata description "Defines where the first item is rendered. The subsequent items follow the first item according to the layout."
     * @ojmetadata displayName "Layout Origin"
     * @ojmetadata help "#layoutOrigin"
     */
    layoutOrigin?: PreactPictoChartProps['layoutOrigin'];
    /**
     * @description
     * The number of columns that the picto chart has. The number of columns will be automatically computed if not specified.
     * @ojmetadata description "Specifies the column count."
     * @ojmetadata displayName "Column Count"
     * @ojmetadata help "#columnCount"
     */
    columnCount?: PreactPictoChartProps['columnCount'];
    /**
     * @description
     * The width of a column in pixels. The width of columns will be automatically computed if not specified. Setting this property in a fixed layout (when the element width and height are defined) may cause items to be truncated.
     * @ojmetadata description "Specifies the column width."
     * @ojmetadata displayName "Column Width"
     * @ojmetadata help "#columnWidth"
     */
    columnWidth?: PreactPictoChartProps['columnWidth'];
    /**
     * @description
     * Specifies a context menu configuration.
     * It takes the keys `accessibleLabel` and `items`,
     * where `accessibleLabel` is optional and items required . `items` function returns an array
     * of menu item object representations that indicates what menu items are going to be part of
     * menu based on some specific context menu context.
     * <table>
     * <tr><th align='left'>Context Menu Item Type</th><th align='left'>Def</th></tr>
     * <tr><td>ContextMenuSeparator</td><td>{ type: 'separator'}</td></tr>
     * <tr><td>MenuItem</td><td>{
     * type?: 'item';
     * label: string;
     * key: string;
     * disabled?: boolean;
     * onAction?: () => void;
     * startIcon?: MenuIcon;
     * endIcon?: MenuIcon;
     * variant?: 'standard' | 'destructive';
     * };</td></tr>
     * <tr><td>ContextMenuSubMenu</td><td>{
     * type: 'submenu';
     * label?: string;
     * disabled?: boolean;
     * startIcon?: string;
     * items?: Array&lt;ContextMenuItems&gt;;
     * };</td></tr>
     * <tr><td>ContextMenuSelectSingle</td><td>{
     * type: 'selectsingle';
     * key?: string;
     * items?: Array&lt;MenuSelectItem&gt;;
     * selection?: string;
     * onSelection?: (detail: { value: string }) => void;
     * };</td></tr>
     * <tr><td>ContextMenuSelectMultiple</td><td>{
     * type: 'selectmultiple';
     * key?: string;
     * items?: Array&lt;MenuSelectItem&gt;;
     * selection?: Array&lt;string&gt;;
     * onSelection?: (detail: { value: Array&lt;string&gt; }) => void;
     * };</td></tr>
     * <tr><td>MenuIcon</td><td>{
     * type?: 'class';
     *     class: string;
     *   }
     * | {
     *     type: 'img';
     *    src: string;
     *   };</td></tr>
     * <tr><td>MenuSelectItem</td><td>{
     * label: string;
     * disabled?: boolean;
     * endIcon?: MenuIcon;
     * value: string;
     * }</td></tr>
     * </table>
     * @ojmetadata description "Specifies a context menu configuration."
     * @ojmetadata displayName "Context Menu Config"
     * @ojmetadata help "#contextMenuConfig"
     */
    contextMenuConfig?: PictoChartContextMenuConfig<K, D>;
    /**
     * @ojmetadata description "Triggered when a menu item is clicked, whether by keyboard, mouse,
     *    or touch events."
     * @ojmetadata eventGroup "common"
     * @ojmetadata displayName "onOjContextMenuAction"
     */
    onOjContextMenuAction?: Action<PictoChartContextMenuActionDetail<K, D>> & Bubbles;
    /**
     * @ojmetadata description "Triggered when a select menu item is clicked, whether by keyboard, mouse,
     *    or touch events."
     * @ojmetadata eventGroup "common"
     * @ojmetadata displayName "onOjContextMenuSelection"
     * @ojmetadata help "#event:ojContextMenuSelection"
     */
    onOjContextMenuSelection?: Action<PictoChartContextMenuSelectionDetail<K, D>> & Bubbles;
    /**
     * @description
     * The number of rows that the picto chart has. The number of rows will be automatically computed if not specified.
     * @ojmetadata description "Specifies the row count."
     * @ojmetadata displayName "Row Count"
     * @ojmetadata help "#rowCount"
     */
    rowCount?: PreactPictoChartProps['rowCount'];
    /**
     * @description
     * The height of a row in pixels. The height of rows will be automatically computed if not specified. Setting this property in a fixed layout (when the element width and height are defined) may cause items to be truncated.
     * @ojmetadata description "Specifies the row height."
     * @ojmetadata displayName "Row Height"
     * @ojmetadata help "#rowHeight"
     */
    rowHeight?: PreactPictoChartProps['rowHeight'];
    /**
     * @description
     * The type of selection behavior that is enabled on the picto chart. This attribute controls the number of selections that can be made via selection gestures at any given time.
     * @ojmetadata description "Specifies the selection mode."
     * @ojmetadata displayName "Selection Mode"
     * @ojmetadata help "#selectionMode"
     */
    selectionMode?: PreactPictoChartProps['selectionMode'];
    /**
     * @description
     * An array of id strings, used to define the selected objects.
     * @ojmetadata description "An array of id strings, used to define the selected objects."
     * @ojmetadata displayName "Selection"
     * @ojmetadata help "#selection"
     */
    selection?: K[];
    /**
     * @ojmetadata description Writeback support for the selection property
     * @ojmetadata displayName "Selection"
     * @ojmetadata help "#selection"
     */
    onSelectionChanged?: PropertyChanged<K[]>;
    /**
     * @description
     * <p>
     *  The <code class="prettyprint">itemTemplate</code> slot is used to specify the template for
     *  creating items. The slot content must be a single  &lt;template>
     *  element.
     * </p>
     * <p>
     *  When the template is executed for each area, it will have access to the picto chart's binding context and the following properties:
     * </p>
     * <ul>
     *   <li>
     *      $current - an object that contains information for the current item.
     *      (See the table below for a list of properties available on $current)
     *   </li>
     *   <li>
     *      alias - if as attribute was specified, the value will be used to provide an application-named alias for $current.
     *   </li>
     * </ul>
     * <p>
     * The content of the template should only be one &lt;oj-c-picto-chart-item> element. See the oj-picto-chart-item doc for more details.
     * </p>
     *
     * @ojmetadata description "The itemTemplate slot is used to map each data item in the component. See the Help documentation for more information."
     * @ojmetadata displayName "itemTemplate"
     * @ojmetadata help "#itemTemplate"
     * @ojmetadata maxItems 1
     */
    itemTemplate?: TemplateSlot<PictoChartItemTemplateContext<K, D>>;
    /**
     * @ojmetadata description "Triggered during a drill gesture (single click on the pictochart item)."
     * @ojmetadata help "#event:drill"
     */
    onOjDrill?: Action<DrillDetail<K>>;
};
/**
 * @classdesc
 * <h3 id="pictoChartOverview-section">
 *   JET PictoChart
 *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#pictoChartOverview-section"></a>
 * </h3>
 *
 * <p>PictoChart uses icons to visualize an absolute number, or the relative sizes of the different parts of a population.</p>
 *
 * <pre class="prettyprint">
 * <code>
 * &lt;oj-c-picto-chart
 *   data="[[dataProvider]]">
 * &lt;/oj-c-picto-chart>
 * </code>
 * </pre>
 *
 *
 * <p> When using colors as a data dimension for PictoChart, the application needs to ensure that they meet minimum contrast requirements.
 *  Not all colors in the default value ramp provided by oj.ColorAttributeGroupHandler will meet minimum contrast requirements.
 * </p>
 *
 * <h3 id="keyboard-section">
 *   Keyboard End User Information
 *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#keyboard-section"></a>
 * </h3>
 * <table class="keyboard-table">
 *   <thead>
 *     <tr>
 *       <th>Key</th>
 *       <th>Action</th>
 *     </tr>
 *   </thead>
 *   <tbody>
 *     <tr>
 *       <td><kbd>Tab</kbd></td>
 *       <td>Move focus to next element.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>Shift + Tab</kbd></td>
 *       <td>Move focus to previous element.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>UpArrow</kbd></td>
 *       <td>Move focus and selection to previous item.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>DownArrow</kbd></td>
 *       <td>Move focus and selection to next item.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>LeftArrow</kbd></td>
 *       <td>Move focus and selection to previous item.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>RightArrow</kbd></td>
 *       <td>Move focus and selection to next item.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>Shift + UpArrow</kbd></td>
 *       <td>Move focus and multi-select previous item.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>Shift + DownArrow</kbd></td>
 *       <td>Move focus and multi-select next item.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>Shift + LeftArrow</kbd></td>
 *       <td>Move focus and multi-select previous item.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>Shift + RightArrow</kbd></td>
 *       <td>Move focus and multi-select next item.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>Ctrl + UpArrow</kbd></td>
 *       <td>Move focus to previous item, without changing the current selection.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>Ctrl + DownArrow</kbd></td>
 *       <td>Move focus to next item, without changing the current selection.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>Ctrl + LeftArrow</kbd></td>
 *       <td>Move focus to previous item, without changing the current selection.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>Ctrl + RightArrow</kbd></td>
 *       <td>Move focus to next item, without changing the current selection.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>Ctrl + Spacebar</kbd></td>
 *       <td>Multi-select item with focus.</td>
 *     </tr>
 *     <tr>
 *       <td><kbd>Enter</kbd></td>
 *       <td>Drill on item when <code class="prettyprint">drilling</code> is enabled..</td>
 *     </tr>
 *   </tbody>
 * </table>
 *
 * <h3 id="a11y-section">
 *   Accessibility
 *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#a11y-section"></a>
 * </h3>
 * To make your component accessible, the application is required to include contextual information for screen readers using either:
 *  <ul>
 *   <li>aria-labelledby</li>
 *   <li>aria-label</li>
 *  </ul>
 * It is also recommended to include appropriate short-desc property values for your items to enhance accessibility.
 *
 * <p>
 *  If your application has custom keyboard and touch shortcuts implemented for the component, these shortcuts can conflict with those of the component. It is the application's responsibility to disclose these custom shortcuts, possibly via a datatip or help popup.
 * </p>
 *
 *
 * <h3 id="touch-section">
 * Touch End User Information
 *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#touch-section"></a>
 * </h3>
 *
 * <table class="keyboard-table">
 *   <thead>
 *     <tr>
 *       <th>Target</th>
 *       <th>Gesture</th>
 *       <th>Action</th>
 *     </tr>
 *   </thead>
 *   <tbody>
 *     <tr>
 *       <td rowspan="3">Data Item</td>
 *       <td rowspan="2"><kbd>Tap</kbd></td>
 *       <td>Select when <code class="prettyprint">selectionMode</code> is enabled.</td>
 *     </tr>
 *     <tr>
 *        <td>Open a link when the <code class="prettyprint">url</code> for a data item is set.</td>
 *     </tr>
 *     <tr>
 *        <td><kbd>Press & Hold</kbd></td>
 *        <td>Display context menu on release.</td>
 *     </tr>
 *     <tr>
 *        <td>Background</td>
 *        <td><kbd>Press & Hold</kbd></td>
 *        <td>Display context menu on release.</td>
 *     </tr>
 *   </tbody>
 * </table>
 *
 *
 * @ojmetadata description "A picto chart is an interactive data visualization of textual data. PictoChart uses icons to visualize an absolute number, or the relative sizes of the different parts of a population."
 * @ojmetadata displayName "Picto Chart"
 * @ojmetadata main "oj-c/picto-chart"
 * @ojmetadata help "oj-c.PictoChart.html"
 * @ojmetadata status [
 *    {
 *      type: "candidate",
 *      since: "20.0.0"
 *    }
 * ]
 * @ojmetadata extension {
 *   "vbdt": {
 *     "module": "oj-c/picto-chart",
 *       "defaultColumns": 12,
 *         "minColumns": 6
 *   },
 *   "oracle": {
 *     "icon": "oj-ux-ico-picto-chart",
 *     "uxSpecs": [
 *       "picto-chart"
 *     ]
 *   }
 * }
 *
 * @ojmetadata propertyLayout [
 *   {
 *     "propertyGroup": "common",
 *     "items": [
 *       "layout",
 *       "style"
 *     ]
 *   },
 *   {
 *     "propertyGroup": "data",
 *     "items": [
 *       "data",
 *       "selection"
 *     ]
 *   }
 *  @ojmetadata since "20.0.0"
 *  @ojmetadata requirements [
 *  {
 *    type: "anyOf",
 *    label: "accessibility",
 *    properties: ["aria-label", "aria-labelledby"]
 *  }
 * ]
 */
declare function PictoChartComp<K extends string | number, D extends any>({ hiddenCategories, columnCount, columnWidth, data, drilling, highlightedCategories, hoverBehavior, layout, layoutOrigin, rowCount, rowHeight, selection, selectionMode, highlightMatch, contextMenuConfig, onOjContextMenuAction, onOjContextMenuSelection, ...props }: PictoChartProps<K, D>): import("preact").JSX.Element;
/**
 * This export corresponds to the PictoChart Preact component. For the oj-c-picto-chart custom element, import CPictoChartElement instead.
 */
export declare const PictoChart: ComponentType<ExtendGlobalProps<ComponentProps<typeof PictoChartComp>>>;
export {};
import { JetElement, JetSettableProperties, JetElementCustomEventStrict, JetSetPropertyType } from 'ojs/index';
import { GlobalProps } from 'ojs/ojvcomponent';
import 'ojs/oj-jsx-interfaces';
/**
 * This export corresponds to the oj-c-picto-chart custom element. For the PictoChart Preact component, import PictoChart instead.
 */
export interface CPictoChartElement<K extends string | number, D extends any> extends JetElement<CPictoChartElementSettableProperties<K, D>>, CPictoChartElementSettableProperties<K, D> {
    addEventListener<T extends keyof CPictoChartElementEventMap<K, D>>(type: T, listener: (this: HTMLElement, ev: CPictoChartElementEventMap<K, D>[T]) => any, options?: (boolean | AddEventListenerOptions)): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: (boolean | AddEventListenerOptions)): void;
    getProperty<T extends keyof CPictoChartElementSettableProperties<K, D>>(property: T): CPictoChartElement<K, D>[T];
    getProperty(property: string): any;
    setProperty<T extends keyof CPictoChartElementSettableProperties<K, D>>(property: T, value: CPictoChartElementSettableProperties<K, D>[T]): void;
    setProperty<T extends string>(property: T, value: JetSetPropertyType<T, CPictoChartElementSettableProperties<K, D>>): void;
    setProperties(properties: CPictoChartElementSettablePropertiesLenient<K, D>): void;
}
export namespace CPictoChartElement {
    interface ojContextMenuAction<K extends string | number, D extends any> extends CustomEvent<PictoChartContextMenuActionDetail<K, D> & {}> {
    }
    interface ojContextMenuSelection<K extends string | number, D extends any> extends CustomEvent<PictoChartContextMenuSelectionDetail<K, D> & {}> {
    }
    interface ojDrill<K extends string | number> extends CustomEvent<DrillDetail<K> & {}> {
    }
    type columnCountChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['columnCount']>;
    type columnWidthChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['columnWidth']>;
    type contextMenuConfigChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['contextMenuConfig']>;
    type dataChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['data']>;
    type drillingChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['drilling']>;
    type hiddenCategoriesChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['hiddenCategories']>;
    type highlightMatchChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['highlightMatch']>;
    type highlightedCategoriesChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['highlightedCategories']>;
    type hoverBehaviorChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['hoverBehavior']>;
    type layoutChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['layout']>;
    type layoutOriginChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['layoutOrigin']>;
    type rowCountChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['rowCount']>;
    type rowHeightChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['rowHeight']>;
    type selectionChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['selection']>;
    type selectionModeChanged<K extends string | number, D extends any> = JetElementCustomEventStrict<CPictoChartElement<K, D>['selectionMode']>;
    type ItemTemplateContext<K extends string | number, D extends any> = PictoChartItemTemplateContext<K, D>;
    type RenderItemTemplate<K extends string | number, D extends any> = import('ojs/ojvcomponent').TemplateSlot<PictoChartItemTemplateContext<K, D>>;
}
export interface CPictoChartElementEventMap<K extends string | number, D extends any> extends HTMLElementEventMap {
    'ojContextMenuAction': CPictoChartElement.ojContextMenuAction<K, D>;
    'ojContextMenuSelection': CPictoChartElement.ojContextMenuSelection<K, D>;
    'ojDrill': CPictoChartElement.ojDrill<K>;
    'columnCountChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['columnCount']>;
    'columnWidthChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['columnWidth']>;
    'contextMenuConfigChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['contextMenuConfig']>;
    'dataChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['data']>;
    'drillingChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['drilling']>;
    'hiddenCategoriesChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['hiddenCategories']>;
    'highlightMatchChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['highlightMatch']>;
    'highlightedCategoriesChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['highlightedCategories']>;
    'hoverBehaviorChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['hoverBehavior']>;
    'layoutChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['layout']>;
    'layoutOriginChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['layoutOrigin']>;
    'rowCountChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['rowCount']>;
    'rowHeightChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['rowHeight']>;
    'selectionChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['selection']>;
    'selectionModeChanged': JetElementCustomEventStrict<CPictoChartElement<K, D>['selectionMode']>;
}
export interface CPictoChartElementSettableProperties<K, D extends Item<K> | any> extends JetSettableProperties {
    /**
     * The number of columns that the picto chart has. The number of columns will be automatically computed if not specified.
     */
    columnCount?: PictoChartProps<K, D>['columnCount'];
    /**
     * The width of a column in pixels. The width of columns will be automatically computed if not specified. Setting this property in a fixed layout (when the element width and height are defined) may cause items to be truncated.
     */
    columnWidth?: PictoChartProps<K, D>['columnWidth'];
    /**
     * Specifies a context menu configuration.
     * It takes the keys `accessibleLabel` and `items`,
     * where `accessibleLabel` is optional and items required . `items` function returns an array
     * of menu item object representations that indicates what menu items are going to be part of
     * menu based on some specific context menu context.
     * <table>
     * <tr><th align='left'>Context Menu Item Type</th><th align='left'>Def</th></tr>
     * <tr><td>ContextMenuSeparator</td><td>{ type: 'separator'}</td></tr>
     * <tr><td>MenuItem</td><td>{
     * type?: 'item';
     * label: string;
     * key: string;
     * disabled?: boolean;
     * onAction?: () => void;
     * startIcon?: MenuIcon;
     * endIcon?: MenuIcon;
     * variant?: 'standard' | 'destructive';
     * };</td></tr>
     * <tr><td>ContextMenuSubMenu</td><td>{
     * type: 'submenu';
     * label?: string;
     * disabled?: boolean;
     * startIcon?: string;
     * items?: Array&lt;ContextMenuItems&gt;;
     * };</td></tr>
     * <tr><td>ContextMenuSelectSingle</td><td>{
     * type: 'selectsingle';
     * key?: string;
     * items?: Array&lt;MenuSelectItem&gt;;
     * selection?: string;
     * onSelection?: (detail: { value: string }) => void;
     * };</td></tr>
     * <tr><td>ContextMenuSelectMultiple</td><td>{
     * type: 'selectmultiple';
     * key?: string;
     * items?: Array&lt;MenuSelectItem&gt;;
     * selection?: Array&lt;string&gt;;
     * onSelection?: (detail: { value: Array&lt;string&gt; }) => void;
     * };</td></tr>
     * <tr><td>MenuIcon</td><td>{
     * type?: 'class';
     *     class: string;
     *   }
     * | {
     *     type: 'img';
     *    src: string;
     *   };</td></tr>
     * <tr><td>MenuSelectItem</td><td>{
     * label: string;
     * disabled?: boolean;
     * endIcon?: MenuIcon;
     * value: string;
     * }</td></tr>
     * </table>
     */
    contextMenuConfig?: PictoChartProps<K, D>['contextMenuConfig'];
    /**
     * Specifies the DataProvider for the sections and items of the picto-chart.
     */
    data: PictoChartProps<K, D>['data'];
    /**
     * Whether drilling is enabled. Drillable items will show a pointer cursor on hover and fire an ojDrill event on click (double click if selection is enabled). To enable or disable drilling on individual items, use the drilling attribute in each item.
     */
    drilling?: PictoChartProps<K, D>['drilling'];
    /**
     * An array of category strings used for highlighting. Data items matching categories in this array will be highlighted.
     */
    hiddenCategories?: PictoChartProps<K, D>['hiddenCategories'];
    /**
     * The matching condition for the highlightedCategories property. By default, highlightMatch is 'all' and only items whose categories match all of the values specified in the highlightedCategories array will be highlighted. If highlightMatch is 'any', then items that match at least one of the highlightedCategories values will be highlighted.
     */
    highlightMatch?: PictoChartProps<K, D>['highlightMatch'];
    /**
     * An array of categories that will be highlighted.
     */
    highlightedCategories?: PictoChartProps<K, D>['highlightedCategories'];
    /**
     * The behavior applied when hovering over data items.
     */
    hoverBehavior?: PictoChartProps<K, D>['hoverBehavior'];
    /**
     * The direction in which the items are laid out.
     */
    layout?: PictoChartProps<K, D>['layout'];
    /**
     * Defines where the first item is rendered. The subsequent items follow the first item according to the layout.
     */
    layoutOrigin?: PictoChartProps<K, D>['layoutOrigin'];
    /**
     * The number of rows that the picto chart has. The number of rows will be automatically computed if not specified.
     */
    rowCount?: PictoChartProps<K, D>['rowCount'];
    /**
     * The height of a row in pixels. The height of rows will be automatically computed if not specified. Setting this property in a fixed layout (when the element width and height are defined) may cause items to be truncated.
     */
    rowHeight?: PictoChartProps<K, D>['rowHeight'];
    /**
     * An array of id strings, used to define the selected objects.
     */
    selection?: PictoChartProps<K, D>['selection'];
    /**
     * The type of selection behavior that is enabled on the picto chart. This attribute controls the number of selections that can be made via selection gestures at any given time.
     */
    selectionMode?: PictoChartProps<K, D>['selectionMode'];
}
export interface CPictoChartElementSettablePropertiesLenient<K, D extends Item<K> | any> extends Partial<CPictoChartElementSettableProperties<K, D>> {
    [key: string]: any;
}
export interface PictoChartIntrinsicProps extends Partial<Readonly<CPictoChartElementSettableProperties<any, any>>>, GlobalProps, Pick<preact.JSX.HTMLAttributes, 'ref' | 'key'> {
    children?: import('preact').ComponentChildren;
    onojContextMenuAction?: (value: CPictoChartElementEventMap<any, any>['ojContextMenuAction']) => void;
    onojContextMenuSelection?: (value: CPictoChartElementEventMap<any, any>['ojContextMenuSelection']) => void;
    onojDrill?: (value: CPictoChartElementEventMap<any, any>['ojDrill']) => void;
    oncolumnCountChanged?: (value: CPictoChartElementEventMap<any, any>['columnCountChanged']) => void;
    oncolumnWidthChanged?: (value: CPictoChartElementEventMap<any, any>['columnWidthChanged']) => void;
    oncontextMenuConfigChanged?: (value: CPictoChartElementEventMap<any, any>['contextMenuConfigChanged']) => void;
    ondataChanged?: (value: CPictoChartElementEventMap<any, any>['dataChanged']) => void;
    ondrillingChanged?: (value: CPictoChartElementEventMap<any, any>['drillingChanged']) => void;
    onhiddenCategoriesChanged?: (value: CPictoChartElementEventMap<any, any>['hiddenCategoriesChanged']) => void;
    onhighlightMatchChanged?: (value: CPictoChartElementEventMap<any, any>['highlightMatchChanged']) => void;
    onhighlightedCategoriesChanged?: (value: CPictoChartElementEventMap<any, any>['highlightedCategoriesChanged']) => void;
    onhoverBehaviorChanged?: (value: CPictoChartElementEventMap<any, any>['hoverBehaviorChanged']) => void;
    onlayoutChanged?: (value: CPictoChartElementEventMap<any, any>['layoutChanged']) => void;
    onlayoutOriginChanged?: (value: CPictoChartElementEventMap<any, any>['layoutOriginChanged']) => void;
    onrowCountChanged?: (value: CPictoChartElementEventMap<any, any>['rowCountChanged']) => void;
    onrowHeightChanged?: (value: CPictoChartElementEventMap<any, any>['rowHeightChanged']) => void;
    onselectionChanged?: (value: CPictoChartElementEventMap<any, any>['selectionChanged']) => void;
    onselectionModeChanged?: (value: CPictoChartElementEventMap<any, any>['selectionModeChanged']) => void;
}
declare global {
    namespace preact.JSX {
        interface IntrinsicElements {
            'oj-c-picto-chart': PictoChartIntrinsicProps;
        }
    }
}
