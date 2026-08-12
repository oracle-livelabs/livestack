import { OjWebElement } from '@oracle/oraclejet-webdriver/elements';
/**
 * This is the base class for oj-c-picto-chart WebElement, and is generated from the
 * component's metadata. Do not modify these contents since they'll be replaced
 * during the next generation.
 * Put overrides into the WebElements's subclass, PictoChartWebElement.ts.
 */
export declare class PictoChartWebElementBase extends OjWebElement {
    /**
     * Gets the value of <code>data</code> property.
     * Specifies the DataProvider for the sections and items of the picto-chart
     * @return The value of <code>data</code> property.
     *
     */
    getData(): Promise<null>;
    /**
     * Sets the value of <code>hiddenCategories</code> property.
     * An array of categories that will be hidden.
     * @param hiddenCategories The value to set for <code>hiddenCategories</code>
     *
     */
    changeHiddenCategories(hiddenCategories: Array<string>): Promise<void>;
    /**
     * Gets the value of <code>hiddenCategories</code> property.
     * An array of categories that will be hidden.
     * @return The value of <code>hiddenCategories</code> property.
     *
     */
    getHiddenCategories(): Promise<Array<string>>;
    /**
     * Gets the value of <code>highlightMatch</code> property.
     * The matching condition for the highlightedCategories option. By default, highlightMatch is 'all' and only items whose categories match all of the values specified in the highlightedCategories array will be highlighted. If highlightMatch is 'any', then items that match at least one of the highlightedCategories values will be highlighted.
     * @return The value of <code>highlightMatch</code> property.
     *
     */
    getHighlightMatch(): Promise<string>;
    /**
     * Sets the value of <code>highlightedCategories</code> property.
     * An array of categories that will be highlighted.
     * @param highlightedCategories The value to set for <code>highlightedCategories</code>
     *
     */
    changeHighlightedCategories(highlightedCategories: Array<string>): Promise<void>;
    /**
     * Gets the value of <code>highlightedCategories</code> property.
     * An array of categories that will be highlighted.
     * @return The value of <code>highlightedCategories</code> property.
     *
     */
    getHighlightedCategories(): Promise<Array<string>>;
    /**
     * Gets the value of <code>hoverBehavior</code> property.
     * Defines the behavior applied when hovering over data items.
     * @return The value of <code>hoverBehavior</code> property.
     *
     */
    getHoverBehavior(): Promise<string>;
    /**
     * Gets the value of <code>layout</code> property.
     * The direction in which the items are laid out.
     * @return The value of <code>layout</code> property.
     *
     */
    getLayout(): Promise<string>;
    /**
     * Gets the value of <code>drilling</code> property.
     * Drillable items will show a pointer cursor on hover and fire an ojDrill event on click (double click if selection is enabled).
     * @return The value of <code>drilling</code> property.
     *
     */
    getDrilling(): Promise<string>;
    /**
     * Gets the value of <code>layoutOrigin</code> property.
     * Defines where the first item is rendered. The subsequent items follow the first item according to the layout.
     * @return The value of <code>layoutOrigin</code> property.
     *
     */
    getLayoutOrigin(): Promise<string>;
    /**
     * Gets the value of <code>columnCount</code> property.
     * Specifies the column count.
     * @return The value of <code>columnCount</code> property.
     *
     */
    getColumnCount(): Promise<number>;
    /**
     * Gets the value of <code>columnWidth</code> property.
     * Specifies the column width.
     * @return The value of <code>columnWidth</code> property.
     *
     */
    getColumnWidth(): Promise<number | string>;
    /**
     * Gets the value of <code>contextMenuConfig</code> property.
     * Specifies a context menu configuration.
     * @return The value of <code>contextMenuConfig</code> property.
     *
     */
    getContextMenuConfig(): Promise<ContextMenuConfig>;
    /**
     * Gets the value of <code>rowCount</code> property.
     * Specifies the row count.
     * @return The value of <code>rowCount</code> property.
     *
     */
    getRowCount(): Promise<number>;
    /**
     * Gets the value of <code>rowHeight</code> property.
     * Specifies the row height.
     * @return The value of <code>rowHeight</code> property.
     *
     */
    getRowHeight(): Promise<number | string>;
    /**
     * Gets the value of <code>selectionMode</code> property.
     * Specifies the selection mode.
     * @return The value of <code>selectionMode</code> property.
     *
     */
    getSelectionMode(): Promise<string>;
    /**
     * Sets the value of <code>selection</code> property.
     * An array of id strings, used to define the selected objects.
     * @param selection The value to set for <code>selection</code>
     *
     */
    changeSelection(selection: Array<string | number>): Promise<void>;
    /**
     * Gets the value of <code>selection</code> property.
     * An array of id strings, used to define the selected objects.
     * @return The value of <code>selection</code> property.
     *
     */
    getSelection(): Promise<Array<string | number>>;
}
export interface ContextMenuConfig {
    /**
     *
     */
    accessibleLabel: string;
}
