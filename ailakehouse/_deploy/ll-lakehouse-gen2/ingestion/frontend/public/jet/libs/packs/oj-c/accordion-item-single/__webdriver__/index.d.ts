import { By } from 'selenium-webdriver';
import { DriverLike } from '@oracle/oraclejet-webdriver';
import { AccordionItemSingleWebElement } from './AccordionItemSingleWebElement';
export { AccordionItemSingleWebElement };
/**
 * Retrieve an instance of [AccordionItemSingleWebElement](../classes/AccordionItemSingleWebElement.html).
 * @example
 * ```javascript
 * import { findAccordionItemSingle } from '@oracle/oraclejet-core-pack/webdriver';
 * const el = await findAccordionItemSingle(driver, By.id('my-oj-c-accordion-item-single'));
 * ```
 * @param driver A WebDriver/WebElement instance from where the element will be
 * searched. If WebDriver is passed, the element will be searched globally in the
 * document. If WebElement is passed, the search will be relative to this element.
 * @param by The locator with which to find the element
 */
export declare function findAccordionItemSingle(driver: DriverLike, by: By): Promise<AccordionItemSingleWebElement>;
