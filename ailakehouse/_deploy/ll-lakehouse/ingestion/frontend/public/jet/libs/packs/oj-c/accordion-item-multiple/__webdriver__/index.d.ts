import { By } from 'selenium-webdriver';
import { DriverLike } from '@oracle/oraclejet-webdriver';
import { AccordionItemMultipleWebElement } from './AccordionItemMultipleWebElement';
export { AccordionItemMultipleWebElement };
/**
 * Retrieve an instance of [AccordionItemMultipleWebElement](../classes/AccordionItemMultipleWebElement.html).
 * @example
 * ```javascript
 * import { findAccordionItemMultiple } from '@oracle/oraclejet-core-pack/webdriver';
 * const el = await findAccordionItemMultiple(driver, By.id('my-oj-c-accordion-item-multiple'));
 * ```
 * @param driver A WebDriver/WebElement instance from where the element will be
 * searched. If WebDriver is passed, the element will be searched globally in the
 * document. If WebElement is passed, the search will be relative to this element.
 * @param by The locator with which to find the element
 */
export declare function findAccordionItemMultiple(driver: DriverLike, by: By): Promise<AccordionItemMultipleWebElement>;
