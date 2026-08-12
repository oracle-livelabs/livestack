define(["require", "exports", '@oracle/oraclejet-preact/translationBundle', "ojs/ojvcomponent"], function (require, exports, translationBundle_1, ojvcomponent_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PictoChartItem = exports.pictoChartItemDefaults = void 0;
    exports.pictoChartItemDefaults = {
        categories: [],
        shape: 'rectangle',
        drilling: 'inherit'
    };
    exports.PictoChartItem = (0, ojvcomponent_1.registerCustomElement)('oj-c-picto-chart-item', 
    /**
     *@classdesc
     *<h3 id="PictoChartItemOverview-section">
     *   JET PictoChart Item
     *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#PictoChartItemOverview-section"></a>
     * </h3>
     *
     * <p>The oj-c-picto-chart-item element is used to declare properties for picto chart items and is only valid as the
     *  child of a template element for the <a target="_blank" href="oj-c.PictoChart.html#itemTemplate">itemTemplate</a> slot of oj-c-picto-chart.</p>
     *
     * <pre class="prettyprint">
     * <code>
     * &lt;oj-c-picto-chart data='[[dataProvider]]'>
     *  &lt;template slot='itemTemplate' data-oj-as='item'>
     *    &lt;oj-c-picto-chart-item  count='[[item.data.count]]' name='[[item.data.name]]' >&lt;/oj-c-picto-chart-item>
     *  &lt;/template>
     * &lt;/oj-c-picto-chart>
     * </code>
     * </pre>
     *
     * @ojmetadata status [
     *    {
     *      type: "candidate",
     *      since: "20.0.0"
     *    }
     * ]
     * @ojmetadata subcomponentType "data"
     * @ojmetadata description "The oj-c-picto-chart-item element is used to declare properties for picto chart items"
     * @ojmetadata displayName "PictoChartItem"
     * @ojmetadata main "oj-c/picto-chart-item"
     * @ojmetadata help "oj-c.PictoChartItem.html"
     * @ojmetadata since "20.0.0"
     */
    ({ categories = exports.pictoChartItemDefaults.categories, shape = exports.pictoChartItemDefaults.shape, drilling = exports.pictoChartItemDefaults.drilling, 
    /* @ts-ignore */
    ...props }) => {
        return null;
    }, "PictoChartItem", { "properties": { "categories": { "type": "Array<string>" }, "drilling": { "type": "string", "enumValues": ["off", "inherit", "on"] }, "color": { "type": "string" }, "columnSpan": { "type": "string" }, "count": { "type": "string" }, "name": { "type": "string" }, "rowSpan": { "type": "string" }, "shape": { "type": "string" }, "shortDesc": { "type": "string" } } }, { "categories": [], "shape": "rectangle", "drilling": "inherit" }, {
        '@oracle/oraclejet-preact': translationBundle_1.default
    });
});
