import { OjWebElement } from '@oracle/oraclejet-webdriver/elements';
/**
 * This is the base class for oj-c-accordion-item-multiple WebElement, and is generated from the
 * component's metadata. Do not modify these contents since they'll be replaced
 * during the next generation.
 * Put overrides into the WebElements's subclass, AccordionItemMultipleWebElement.ts.
 */
export declare class AccordionItemMultipleWebElementBase extends OjWebElement {
    /**
     * Gets the value of <code>itemKey</code> property.
     * Specifies the item key of each AccordionItemMultiple.
     * @return The value of <code>itemKey</code> property.
     *
     */
    getItemKey(): Promise<string | number>;
    /**
     * Sets the value of <code>expandedKeys</code> property.
     * Specifies the expandedKeys.
     * @param expandedKeys The value to set for <code>expandedKeys</code>
     *
     */
    changeExpandedKeys(expandedKeys: Array<string | number>): Promise<void>;
    /**
     * Gets the value of <code>expandedKeys</code> property.
     * Specifies the expandedKeys.
     * @return The value of <code>expandedKeys</code> property.
     *
     */
    getExpandedKeys(): Promise<Array<string | number>>;
    /**
     * Gets the value of <code>disabled</code> property.
     * Disables the item if set to true.
     * @return The value of <code>disabled</code> property.
     *
     */
    getDisabled(): Promise<boolean>;
    /**
     * Gets the value of <code>iconPosition</code> property.
     * Changes chevron icon placement at the end of the collapsible header.
     * @return The value of <code>iconPosition</code> property.
     *
     */
    getIconPosition(): Promise<string>;
}
