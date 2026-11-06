/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
define(["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getXaxis = exports.getY2axis = exports.getYaxis = void 0;
    /**
     * Returns the sizing information of the y axis.
     * @param {CLineChartElement} element  An oj-c-line-chart or oj-c-area-chart element.
     */
    const getYaxis = function (element) {
        return element._getYaxis?.();
    };
    exports.getYaxis = getYaxis;
    /**
     * Returns the sizing information of the y2 axis.
     * @param {CLineChartElement} element  An oj-c-line-chart or oj-c-area-chart element.
     */
    const getY2axis = function (element) {
        return element._getY2axis?.();
    };
    exports.getY2axis = getY2axis;
    /**
     * Returns the sizing information of the x axis.
     * @param {CLineChartElement} element  An oj-c-line-chart or oj-c-area-chart element.
     */
    const getXaxis = function (element) {
        return element._getXaxis?.();
    };
    exports.getXaxis = getXaxis;
});
