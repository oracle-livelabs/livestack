import { By } from 'selenium-webdriver';
import { DriverLike } from '@oracle/oraclejet-webdriver';
import { PictoChartWebElement } from './PictoChartWebElement';
export { PictoChartWebElement };
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
export declare function findPictoChart(driver: DriverLike, by: By): Promise<PictoChartWebElement>;
