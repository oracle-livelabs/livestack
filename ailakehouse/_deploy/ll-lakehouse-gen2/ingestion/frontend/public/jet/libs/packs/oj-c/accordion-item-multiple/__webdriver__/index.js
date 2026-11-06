"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccordionItemMultipleWebElement = void 0;
exports.findAccordionItemMultiple = findAccordionItemMultiple;
const oraclejet_webdriver_1 = require("@oracle/oraclejet-webdriver");
const AccordionItemMultipleWebElement_1 = require("./AccordionItemMultipleWebElement");
Object.defineProperty(exports, "AccordionItemMultipleWebElement", { enumerable: true, get: function () { return AccordionItemMultipleWebElement_1.AccordionItemMultipleWebElement; } });
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
async function findAccordionItemMultiple(driver, by) {
    const webEl = await driver.findElement(by);
    // Check that the element is of type AccordionItemMultipleWebElement
    if (!(webEl instanceof AccordionItemMultipleWebElement_1.AccordionItemMultipleWebElement)) {
        const tagName = await webEl.getTagName();
        let supplemental = '';
        if (webEl.constructor.name === 'AccordionItemMultipleWebElement') {
            supplemental = 'You likely have multiple installations of this package.';
        }
        throw Error(`findAccordionItemMultiple(${by}) created ${webEl.constructor.name} for <${tagName}>, but expected ${AccordionItemMultipleWebElement_1.AccordionItemMultipleWebElement.name}. ${supplemental}`);
    }
    return webEl;
}
(0, oraclejet_webdriver_1.register)('oj-c-accordion-item-multiple', AccordionItemMultipleWebElement_1.AccordionItemMultipleWebElement);
//# sourceMappingURL=index.js.map