"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccordionItemSingleWebElement = void 0;
exports.findAccordionItemSingle = findAccordionItemSingle;
const oraclejet_webdriver_1 = require("@oracle/oraclejet-webdriver");
const AccordionItemSingleWebElement_1 = require("./AccordionItemSingleWebElement");
Object.defineProperty(exports, "AccordionItemSingleWebElement", { enumerable: true, get: function () { return AccordionItemSingleWebElement_1.AccordionItemSingleWebElement; } });
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
async function findAccordionItemSingle(driver, by) {
    const webEl = await driver.findElement(by);
    // Check that the element is of type AccordionItemSingleWebElement
    if (!(webEl instanceof AccordionItemSingleWebElement_1.AccordionItemSingleWebElement)) {
        const tagName = await webEl.getTagName();
        let supplemental = '';
        if (webEl.constructor.name === 'AccordionItemSingleWebElement') {
            supplemental = 'You likely have multiple installations of this package.';
        }
        throw Error(`findAccordionItemSingle(${by}) created ${webEl.constructor.name} for <${tagName}>, but expected ${AccordionItemSingleWebElement_1.AccordionItemSingleWebElement.name}. ${supplemental}`);
    }
    return webEl;
}
(0, oraclejet_webdriver_1.register)('oj-c-accordion-item-single', AccordionItemSingleWebElement_1.AccordionItemSingleWebElement);
//# sourceMappingURL=index.js.map