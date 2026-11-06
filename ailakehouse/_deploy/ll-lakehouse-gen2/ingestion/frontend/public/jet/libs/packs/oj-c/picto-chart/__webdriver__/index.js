"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PictoChartWebElement = void 0;
exports.findPictoChart = findPictoChart;
const oraclejet_webdriver_1 = require("@oracle/oraclejet-webdriver");
const PictoChartWebElement_1 = require("./PictoChartWebElement");
Object.defineProperty(exports, "PictoChartWebElement", { enumerable: true, get: function () { return PictoChartWebElement_1.PictoChartWebElement; } });
/**
 * Retrieve an instance of [PictoChartWebElement](../classes/PictoChartWebElement.html).
 * @example
 * ```javascript
 * import { findPictoChart } from '@oracle/oraclejet-core-pack/webdriver';
 * const el = await findPictoChart(driver, By.id('my-oj-c-picto-chart'));
 * ```
 * @param driver A WebDriver/WebElement instance from where the element will be
 * searched. If WebDriver is passed, the element will be searched globally in the
 * document. If WebElement is passed, the search will be relative to this element.
 * @param by The locator with which to find the element
 */
async function findPictoChart(driver, by) {
    const webEl = await driver.findElement(by);
    // Check that the element is of type PictoChartWebElement
    if (!(webEl instanceof PictoChartWebElement_1.PictoChartWebElement)) {
        const tagName = await webEl.getTagName();
        let supplemental = '';
        if (webEl.constructor.name === 'PictoChartWebElement') {
            supplemental = 'You likely have multiple installations of this package.';
        }
        throw Error(`findPictoChart(${by}) created ${webEl.constructor.name} for <${tagName}>, but expected ${PictoChartWebElement_1.PictoChartWebElement.name}. ${supplemental}`);
    }
    return webEl;
}
(0, oraclejet_webdriver_1.register)('oj-c-picto-chart', PictoChartWebElement_1.PictoChartWebElement);
//# sourceMappingURL=index.js.map