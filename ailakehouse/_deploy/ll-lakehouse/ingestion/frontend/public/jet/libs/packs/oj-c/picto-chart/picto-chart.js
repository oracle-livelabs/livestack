define(["require", "exports", "preact/jsx-runtime", '@oracle/oraclejet-preact/translationBundle', "preact/hooks", "preact/compat", "@oracle/oraclejet-preact/UNSAFE_PictoChart", "ojs/ojcontext", "@oracle/oraclejet-preact/UNSAFE_VisNoDataMessage", "../hooks/UNSAFE_useVizCategories/useVizCategories", "ojs/ojvcomponent", "oj-c/hooks/PRIVATE_useVisContextMenu/useVisContextMenu", "./utils", "../hooks/UNSAFE_useDataProvider/useDataProvider", "../utils/PRIVATE_vizUtils/TemplateHandler", "css!oj-c/picto-chart/picto-chart-styles.css"], function (require, exports, jsx_runtime_1, translationBundle_1, hooks_1, compat_1, UNSAFE_PictoChart_1, Context, UNSAFE_VisNoDataMessage_1, useVizCategories_1, ojvcomponent_1, useVisContextMenu_1, utils_1, useDataProvider_1, TemplateHandler_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PictoChart = void 0;
    /**
     * @classdesc
     * <h3 id="pictoChartOverview-section">
     *   JET PictoChart
     *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#pictoChartOverview-section"></a>
     * </h3>
     *
     * <p>PictoChart uses icons to visualize an absolute number, or the relative sizes of the different parts of a population.</p>
     *
     * <pre class="prettyprint">
     * <code>
     * &lt;oj-c-picto-chart
     *   data="[[dataProvider]]">
     * &lt;/oj-c-picto-chart>
     * </code>
     * </pre>
     *
     *
     * <p> When using colors as a data dimension for PictoChart, the application needs to ensure that they meet minimum contrast requirements.
     *  Not all colors in the default value ramp provided by oj.ColorAttributeGroupHandler will meet minimum contrast requirements.
     * </p>
     *
     * <h3 id="keyboard-section">
     *   Keyboard End User Information
     *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#keyboard-section"></a>
     * </h3>
     * <table class="keyboard-table">
     *   <thead>
     *     <tr>
     *       <th>Key</th>
     *       <th>Action</th>
     *     </tr>
     *   </thead>
     *   <tbody>
     *     <tr>
     *       <td><kbd>Tab</kbd></td>
     *       <td>Move focus to next element.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>Shift + Tab</kbd></td>
     *       <td>Move focus to previous element.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>UpArrow</kbd></td>
     *       <td>Move focus and selection to previous item.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>DownArrow</kbd></td>
     *       <td>Move focus and selection to next item.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>LeftArrow</kbd></td>
     *       <td>Move focus and selection to previous item.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>RightArrow</kbd></td>
     *       <td>Move focus and selection to next item.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>Shift + UpArrow</kbd></td>
     *       <td>Move focus and multi-select previous item.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>Shift + DownArrow</kbd></td>
     *       <td>Move focus and multi-select next item.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>Shift + LeftArrow</kbd></td>
     *       <td>Move focus and multi-select previous item.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>Shift + RightArrow</kbd></td>
     *       <td>Move focus and multi-select next item.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>Ctrl + UpArrow</kbd></td>
     *       <td>Move focus to previous item, without changing the current selection.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>Ctrl + DownArrow</kbd></td>
     *       <td>Move focus to next item, without changing the current selection.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>Ctrl + LeftArrow</kbd></td>
     *       <td>Move focus to previous item, without changing the current selection.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>Ctrl + RightArrow</kbd></td>
     *       <td>Move focus to next item, without changing the current selection.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>Ctrl + Spacebar</kbd></td>
     *       <td>Multi-select item with focus.</td>
     *     </tr>
     *     <tr>
     *       <td><kbd>Enter</kbd></td>
     *       <td>Drill on item when <code class="prettyprint">drilling</code> is enabled..</td>
     *     </tr>
     *   </tbody>
     * </table>
     *
     * <h3 id="a11y-section">
     *   Accessibility
     *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#a11y-section"></a>
     * </h3>
     * To make your component accessible, the application is required to include contextual information for screen readers using either:
     *  <ul>
     *   <li>aria-labelledby</li>
     *   <li>aria-label</li>
     *  </ul>
     * It is also recommended to include appropriate short-desc property values for your items to enhance accessibility.
     *
     * <p>
     *  If your application has custom keyboard and touch shortcuts implemented for the component, these shortcuts can conflict with those of the component. It is the application's responsibility to disclose these custom shortcuts, possibly via a datatip or help popup.
     * </p>
     *
     *
     * <h3 id="touch-section">
     * Touch End User Information
     *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#touch-section"></a>
     * </h3>
     *
     * <table class="keyboard-table">
     *   <thead>
     *     <tr>
     *       <th>Target</th>
     *       <th>Gesture</th>
     *       <th>Action</th>
     *     </tr>
     *   </thead>
     *   <tbody>
     *     <tr>
     *       <td rowspan="3">Data Item</td>
     *       <td rowspan="2"><kbd>Tap</kbd></td>
     *       <td>Select when <code class="prettyprint">selectionMode</code> is enabled.</td>
     *     </tr>
     *     <tr>
     *        <td>Open a link when the <code class="prettyprint">url</code> for a data item is set.</td>
     *     </tr>
     *     <tr>
     *        <td><kbd>Press & Hold</kbd></td>
     *        <td>Display context menu on release.</td>
     *     </tr>
     *     <tr>
     *        <td>Background</td>
     *        <td><kbd>Press & Hold</kbd></td>
     *        <td>Display context menu on release.</td>
     *     </tr>
     *   </tbody>
     * </table>
     *
     *
     * @ojmetadata description "A picto chart is an interactive data visualization of textual data. PictoChart uses icons to visualize an absolute number, or the relative sizes of the different parts of a population."
     * @ojmetadata displayName "Picto Chart"
     * @ojmetadata main "oj-c/picto-chart"
     * @ojmetadata help "oj-c.PictoChart.html"
     * @ojmetadata status [
     *    {
     *      type: "candidate",
     *      since: "20.0.0"
     *    }
     * ]
     * @ojmetadata extension {
     *   "vbdt": {
     *     "module": "oj-c/picto-chart",
     *       "defaultColumns": 12,
     *         "minColumns": 6
     *   },
     *   "oracle": {
     *     "icon": "oj-ux-ico-picto-chart",
     *     "uxSpecs": [
     *       "picto-chart"
     *     ]
     *   }
     * }
     *
     * @ojmetadata propertyLayout [
     *   {
     *     "propertyGroup": "common",
     *     "items": [
     *       "layout",
     *       "style"
     *     ]
     *   },
     *   {
     *     "propertyGroup": "data",
     *     "items": [
     *       "data",
     *       "selection"
     *     ]
     *   }
     *  @ojmetadata since "20.0.0"
     *  @ojmetadata requirements [
     *  {
     *    type: "anyOf",
     *    label: "accessibility",
     *    properties: ["aria-label", "aria-labelledby"]
     *  }
     * ]
     */
    function PictoChartComp({ hiddenCategories = [], columnCount, columnWidth, data = null, drilling = 'off', highlightedCategories = [], hoverBehavior = 'none', layout = 'horizontal', layoutOrigin = 'topStart', rowCount, rowHeight, selection = [], selectionMode = 'none', highlightMatch = 'all', contextMenuConfig, onOjContextMenuAction, onOjContextMenuSelection, ...props }) {
        const rootRef = (0, hooks_1.useRef)(null);
        const [compSize, setCompSize] = (0, hooks_1.useState)({
            width: '1000px',
            height: '1000px'
        }); // start with flowing layout
        const rootDims = (0, hooks_1.useRef)();
        const addBusyState = (0, hooks_1.useCallback)((description) => {
            // if the component is not mounted, return a noop
            return rootRef.current
                ? Context.getContext(rootRef.current)
                    .getBusyContext()
                    .addBusyState({ description: description })
                : () => { };
        }, []);
        const { data: compData } = (0, useDataProvider_1.useDataProvider)({
            data: data ? data : undefined,
            addBusyState: addBusyState
        });
        const isHighlightOn = hoverBehavior === 'dim';
        const getItemContext = (context, index) => {
            return {
                data: context.data,
                key: context.key,
                index
            };
        };
        const items = (0, compat_1.useMemo)(() => {
            const items = props.itemTemplate
                ? (0, TemplateHandler_1.processTemplate)(compData, props.itemTemplate, getItemContext, 'oj-c-picto-chart-item')
                : compData.map((item) => {
                    const data = item.data;
                    return { id: item.key, ...data };
                });
            return items;
        }, [props.itemTemplate, compData]);
        const [idItemMap, preactItems, hasItemDrilling] = (0, compat_1.useMemo)(() => {
            const idItemMap = new Map();
            let hasItemDrilling = false;
            const preactItems = items.map((item) => {
                if (item.id != null || item.key != null)
                    idItemMap.set(item.id || item.key, item);
                hasItemDrilling = hasItemDrilling || item.drilling === 'on';
                return (0, utils_1.transformItem)(item);
            });
            return [idItemMap, preactItems, hasItemDrilling];
        }, [items]);
        const [categoriesItems] = (0, compat_1.useMemo)(() => {
            const categories = items.map((item, itemIndex) => {
                return { id: preactItems[itemIndex].id, categories: item.categories || [] };
            });
            return [categories];
        }, [preactItems]);
        const { hiddenIds, highlightedIds, updateHighlighted } = (0, useVizCategories_1.useVizCategories)(categoriesItems, (item) => item.categories, hiddenCategories, highlightedCategories, highlightMatch, 'any', props.onHiddenCategoriesChanged, props.onHighlightedCategoriesChanged);
        const itemActionHandler = (detail) => {
            const item = idItemMap.get(detail.id);
            if (detail.id && item?.drilling !== 'off') {
                props.onOjDrill?.({ id: detail.id });
            }
        };
        const selectionChangeHandler = (detail) => {
            props.onSelectionChanged?.(detail.ids);
        };
        const inputHandler = (detail) => {
            updateHighlighted(detail.id);
        };
        const rendererOptions = (item) => {
            return { shape: item.shape, color: item.color };
        };
        const { markerRenderer, datatipRenderer } = (0, UNSAFE_PictoChart_1.getPictoDefaultRenderers)(rendererOptions);
        const { preactContextMenuConfig } = (0, useVisContextMenu_1.useVisContextMenu)(idItemMap, contextMenuConfig, onOjContextMenuAction, onOjContextMenuSelection);
        (0, hooks_1.useLayoutEffect)(() => {
            if (items.length !== 0) {
                const parentStyle = rootRef.current && window.getComputedStyle(rootRef.current);
                const parentWidth = parentStyle?.width;
                const parentHeight = parentStyle?.height;
                const isWidthFlowing = parentWidth === '0px' ||
                    parentWidth === '1000px' ||
                    (parentWidth !== rootDims.current?.width && rootDims.current?.width !== undefined);
                const isHeightFlowing = parentHeight === '0px' ||
                    parentHeight === '1000px' ||
                    (parentHeight !== rootDims.current?.height && rootDims.current?.height !== undefined);
                const width = isWidthFlowing ? undefined : '100%'; // if flowing width will be 0
                const height = isHeightFlowing ? undefined : '100%'; // if flowing height will be 0
                rootDims.current = { width: parentWidth, height: parentHeight };
                setCompSize({ width, height });
            }
        }, [items]);
        return ((0, jsx_runtime_1.jsx)(ojvcomponent_1.Root, { ref: rootRef, children: !data || items.length === 0 ? ((0, jsx_runtime_1.jsx)(UNSAFE_VisNoDataMessage_1.VisNoDataMessage, { "aria-label": props['aria-label'] })) : ((0, jsx_runtime_1.jsx)("div", { class: `oj-c-picto-chart-content-container oj-c-picto-chart-${layoutOrigin}`, children: (0, jsx_runtime_1.jsx)(UNSAFE_PictoChart_1.PictoChart, { layout: layout, highlightedIds: isHighlightOn ? highlightedIds : undefined, rowCount: rowCount, columnCount: columnCount, rowHeight: rowHeight, columnWidth: columnWidth, layoutOrigin: layoutOrigin, "aria-label": props['aria-label'], "aria-describedBy": props['aria-describedby'], "aria-labelledBy": props['aria-labelledby'], items: preactItems.filter((i) => !hiddenIds?.includes(i.id)), selectionMode: selectionMode, datatip: datatipRenderer, onSelectionChange: selectionChangeHandler, onItemDrill: hasItemDrilling || drilling === 'on' ? itemActionHandler : undefined, onItemFocus: isHighlightOn ? inputHandler : undefined, selectedIds: selectionMode === 'none' ? undefined : selection, width: compSize.width, height: compSize.height, contextMenuConfig: contextMenuConfig ? preactContextMenuConfig : undefined, children: markerRenderer }) })) }));
    }
    exports.PictoChart = (0, ojvcomponent_1.registerCustomElement)('oj-c-picto-chart', PictoChartComp, "PictoChart", { "properties": { "data": { "type": "DataProvider|null" }, "hiddenCategories": { "type": "Array<string>", "writeback": true }, "highlightMatch": { "type": "string", "enumValues": ["all", "any"] }, "highlightedCategories": { "type": "Array<string>", "writeback": true }, "hoverBehavior": { "type": "string", "enumValues": ["none", "dim"] }, "layout": { "type": "string", "enumValues": ["horizontal", "vertical"] }, "drilling": { "type": "string", "enumValues": ["off", "on"] }, "layoutOrigin": { "type": "string", "enumValues": ["topStart", "topEnd", "bottomStart", "bottomEnd"] }, "columnCount": { "type": "number" }, "columnWidth": { "type": "number|string" }, "contextMenuConfig": { "type": "object", "properties": { "accessibleLabel": { "type": "string" }, "items": { "type": "function" } } }, "rowCount": { "type": "number" }, "rowHeight": { "type": "number|string" }, "selectionMode": { "type": "string", "enumValues": ["none", "multiple", "single"] }, "selection": { "type": "Array<string|number>", "writeback": true } }, "events": { "ojContextMenuAction": { "bubbles": true }, "ojContextMenuSelection": { "bubbles": true }, "ojDrill": {} }, "slots": { "itemTemplate": { "data": {} } }, "extension": { "_WRITEBACK_PROPS": ["hiddenCategories", "highlightedCategories", "selection"], "_READ_ONLY_PROPS": [], "_OBSERVED_GLOBAL_PROPS": ["aria-label", "aria-labelledby", "aria-describedby"] } }, { "hiddenCategories": [], "data": null, "drilling": "off", "highlightedCategories": [], "hoverBehavior": "none", "layout": "horizontal", "layoutOrigin": "topStart", "selection": [], "selectionMode": "none", "highlightMatch": "all" }, {
        '@oracle/oraclejet-preact': translationBundle_1.default
    });
});
