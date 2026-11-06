"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TabBarMixedWebElement = void 0;
const selenium_webdriver_1 = require("selenium-webdriver");
const TabBarMixedWebElementBase_1 = require("./TabBarMixedWebElementBase");
/**
 * The component WebElement for [oj-c-tab-bar-mixed](../../jsdocs/oj-c.TabBarMixed.html).
 * Do not instantiate this class directly, instead, use
 * [findTabBarMixed](../modules.html#findTabBarMixed).
 */
class TabBarMixedWebElement extends TabBarMixedWebElementBase_1.TabBarMixedWebElementBase {
    // Put overrides here
    /**
     * Selects tab specified by key.
     * Triggers ojSelectionAction regardless if the key passed is same as the current selection value or not.
     * @param key key of the tab to be selected
     * @override
     * @typeparam K Type of keys
     */
    async doSelection(key) {
        await this.whenReady();
        try {
            const tab = await this.findElement(selenium_webdriver_1.By.css(`[data-oj-key="${key}"]`));
            const driver = this.getDriver();
            await driver.executeScript((el) => el.scrollIntoView({ behavior: 'instant' }), tab);
            await tab?.click();
        }
        catch (e) {
            if (e instanceof selenium_webdriver_1.error.NoSuchElementError) {
                // Try to open overflow and retry item click
                try {
                    const driver = this.getDriver();
                    const overflowBtn = await this.findElement(selenium_webdriver_1.By.css(`[data-oj-key="overflow"]`));
                    await overflowBtn?.click();
                    // To check if there are no pending menu animations for opening dropdown so we can proceed with fetching the items
                    await driver.wait(async () => {
                        const animatedDropdowns = await driver.findElements(selenium_webdriver_1.By.css(`[data-oj-layer] [oj-animation-pending=true]`));
                        return !animatedDropdowns.length;
                    });
                    // Wait for the overflowing tab item to be located in the DOM
                    const item = await driver.wait(selenium_webdriver_1.until.elementLocated(selenium_webdriver_1.By.css(`[data-oj-key="${key}"]`)), 500);
                    // If dropdown does not fit in the test window and item is not in view this allows it to be scrolled into view
                    await driver.executeScript((el) => el.scrollIntoView({ behavior: 'instant' }), item);
                    if (item) {
                        const actions = this.getDriver().actions();
                        await actions.click(item).perform();
                    }
                }
                catch (e) {
                    console.error(`Tab with specified key "${key}" cannot be found due to error: ${e}`);
                    throw e;
                }
            }
        }
    }
    /**
     * Removes tab specified by key.
     * @param key key of the tab to be removed
     * @override
     * @typeparam K Type of keys
     */
    async doRemove(key) {
        await this.whenReady();
        try {
            const tab = await this.findElement(selenium_webdriver_1.By.css(`[data-oj-key="${key}"]`));
            const driver = this.getDriver();
            await driver.executeScript((el) => el.scrollIntoView({ behavior: 'instant' }), tab);
            const removeButton = await tab.findElement(selenium_webdriver_1.By.css('[data-oj-tabbar-item-remove-icon="true"]'));
            await removeButton?.click();
        }
        catch (e) {
            if (e instanceof selenium_webdriver_1.error.NoSuchElementError) {
                // Try to open overflow and retry item click
                try {
                    const driver = this.getDriver();
                    const overflowBtn = await this.findElement(selenium_webdriver_1.By.css(`[data-oj-key="overflow"]`));
                    await overflowBtn?.click();
                    // To check if there are no pending menu animations for opening dropdown so we can proceed with fetching the items
                    await driver.wait(async () => {
                        const animatedDropdowns = await driver.findElements(selenium_webdriver_1.By.css(`[data-oj-layer] [oj-animation-pending=true]`));
                        return !animatedDropdowns.length;
                    });
                    // Wait for the overflowing tab item to be located in the DOM
                    const item = await driver.wait(selenium_webdriver_1.until.elementLocated(selenium_webdriver_1.By.css(`[data-oj-key="${key}"]`)), 500);
                    // If dropdown does not fit in the test window and item is not in view this allows it to be scrolled into view
                    await driver.executeScript((el) => el.scrollIntoView({ behavior: 'instant' }), item);
                    // The items inside overflow menu are navigation list items, so we use the data attribute corresponding to its remove icon
                    const removeButton = await item.findElement(selenium_webdriver_1.By.css('[data-oj-navigationlist-item-remove-icon="true"]'));
                    await driver.wait(selenium_webdriver_1.until.elementIsVisible(removeButton), 500);
                    if (removeButton) {
                        const actions = this.getDriver().actions();
                        await actions.click(removeButton).perform();
                    }
                }
                catch (e) {
                    console.error(`Tab with specified key "${key}" cannot be found due to error: ${e}`);
                    throw e;
                }
            }
        }
    }
}
exports.TabBarMixedWebElement = TabBarMixedWebElement;
//# sourceMappingURL=TabBarMixedWebElement.js.map