define("oj-c/picto-chart-item/picto-chart-item",["require","exports","@oracle/oraclejet-preact/translationBundle","ojs/ojvcomponent"],(function(require,t,e,r){"use strict";Object.defineProperty(t,"__esModule",{value:!0}),t.PictoChartItem=t.pictoChartItemDefaults=void 0,t.pictoChartItemDefaults={categories:[],shape:"rectangle",drilling:"inherit"},t.PictoChartItem=(0,r.registerCustomElement)("oj-c-picto-chart-item",(({categories:e=t.pictoChartItemDefaults.categories,shape:r=t.pictoChartItemDefaults.shape,drilling:i=t.pictoChartItemDefaults.drilling,...o})=>null),"PictoChartItem",{properties:{categories:{type:"Array<string>"},drilling:{type:"string",enumValues:["off","inherit","on"]},color:{type:"string"},columnSpan:{type:"string"},count:{type:"string"},name:{type:"string"},rowSpan:{type:"string"},shape:{type:"string"},shortDesc:{type:"string"}}},{categories:[],shape:"rectangle",drilling:"inherit"},{"@oracle/oraclejet-preact":e.default})})),
/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
define("oj-c/picto-chart-item",["require","exports","oj-c/picto-chart-item/picto-chart-item"],(function(require,t,e){"use strict";Object.defineProperty(t,"__esModule",{value:!0}),t.pictoChartItemDefaults=void 0,Object.defineProperty(t,"pictoChartItemDefaults",{enumerable:!0,get:function(){return e.pictoChartItemDefaults}})}));
//# sourceMappingURL=picto-chart-item.js.map