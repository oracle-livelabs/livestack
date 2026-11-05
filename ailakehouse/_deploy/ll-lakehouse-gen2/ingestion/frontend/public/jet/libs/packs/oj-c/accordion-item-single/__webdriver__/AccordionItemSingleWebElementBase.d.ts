import { OjWebElement } from '@oracle/oraclejet-webdriver/elements';
/**
 * This is the base class for oj-c-accordion-item-single WebElement, and is generated from the
 * component's metadata. Do not modify these contents since they'll be replaced
 * during the next generation.
 * Put overrides into the WebElements's subclass, AccordionItemSingleWebElement.ts.
 */
export declare class AccordionItemSingleWebElementBase extends OjWebElement {
    /**
     * Gets the value of <code>itemKey</code> property.
     * Specifies the item key of each AccordionItemSingle.
     * @return The value of <code>itemKey</code> property.
     *
     */
    getItemKey(): Promise<string | number>;
    /**
     * Sets the value of <code>expandedKey</code> property.
     * Specifies the expandedKey.
     * @param expandedKey The value to set for <code>expandedKey</code>
     *
     */
    changeExpandedKey(expandedKey: string | number | null): Promise<void>;
    /**
     * Gets the value of <code>expandedKey</code> property.
     * Specifies the expandedKey.
     * @return The value of <code>expandedKey</code> property.
     *
     */
    getExpandedKey(): Promise<string | number | null>;
    /**
     * Gets the value of <code>disabled</code> property.
     * Disables the collapsible if set to true.
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
