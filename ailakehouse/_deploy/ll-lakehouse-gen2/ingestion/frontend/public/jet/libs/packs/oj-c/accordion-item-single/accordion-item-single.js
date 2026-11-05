define(["require", "exports", "preact/jsx-runtime", '@oracle/oraclejet-preact/translationBundle', "@oracle/oraclejet-preact/UNSAFE_AccordionItemSingle", "preact/hooks", "ojs/ojvcomponent", "@oracle/oraclejet-preact/hooks/UNSAFE_useTabbableMode"], function (require, exports, jsx_runtime_1, translationBundle_1, UNSAFE_AccordionItemSingle_1, hooks_1, ojvcomponent_1, UNSAFE_useTabbableMode_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AccordionItemSingle = void 0;
    /**
     * @classdesc
     * <h3 id="AccordionItemSingleOverview-section">
     *   JET AccordionItemSingle
     *   <a class="bookmarkable-link" title="Bookmarkable Link" href="#AccordionItemSingleOverview-section"></a>
     * </h3>
     * <p>Description: The <code>oj-c-accordion-item-single</code> component renders collapsible content in a group, supporting single expansion mode (only one item expanded at a time). Use <code>itemKey</code> and <code>expandedKey</code> to control and identify expanded items. Event handlers <code>onOjExpand</code> and <code>onOjCollapse</code> provide callbacks for responding to expansion and collapse events.</p>
     * <p>This component is typically used in Layout & Nav scenarios, such as within templates for Table, ListView, or CardView. It supports accessibility via the <code>aria-label</code> attribute and requires header text for screen readers.</p>
     *
     * <pre class="prettyprint"><code>
     * &lt;oj-c-accordion-item-single
     *    item-key="item1"
     *    expanded-key="[[expanded]]"
     *    on-oj-expand="[[expandHandler]]"
     *    on-oj-collapse="[[collapseHandler]]"
     *    aria-label="Details for Item 1"
     * &gt;
     *   &lt;h3 slot="header"&gt;Item 1&lt;/h3&gt;
     *   &lt;div&gt;Content for Item 1&lt;/div&gt;
     * &lt;/oj-c-accordion-item-single&gt;
     * </code></pre>
     *
     * <h3 id="a11y-section">Accessibility</h3>
     * <p>Specify a value for the <code>aria-label</code> attribute with a meaningful description of the purpose of this accordion item for accessibility. Header text is required for screen readers.</p>
     *
     * <h3 id="keyboard-section">Keyboard End User Information</h3>
     * <ul>
     *   <li><kbd>Enter/Space</kbd>: Toggle expansion/collapse of the item.</li>
     *   <li><kbd>Tab</kbd>: Move focus to the next tabbable element.</li>
     * </ul>
     *
     * <h3 id="touch-section">Touch End User Information</h3>
     * <ul>
     *   <li><b>Tap</b> on header: Toggle expansion/collapse of the item.</li>
     * </ul>
     *
     * <h3 id="validation-section">Validation and Messaging</h3>
     * <p>This component does not support validation or messaging directly. Use parent form components for validation if needed.</p>
     *
     * <h3 id="user-assistance-text-section">User Assistance Text</h3>
     * <p>Provide clear header text and aria-labels for accessibility and user guidance.</p>
     *
     *
     * @typeparam K Type extends string or number
     * @ojmetadata description "An accordion item single component renders collapsible content in a group to support single expansion, when only one of the items in the group can be expanded at a time."
     * @ojmetadata displayName "AccordionItemSingle"
     * @ojmetadata extension {
     *   "catalog": {
     *     "category": "Layout & Nav"
     *   },
     *   "vbdt": {
     *     "module": "oj-c/accordion-item-single"
     *   }
     * }
     * @ojmetadata help "oj-c.AccordionItemSingle.html"
     * @ojmetadata since "20.0.0"
     * @ojmetadata main "oj-c/accordion-item-single"
     * @ojmetadata status [
     *   {
     *     "type": "supersedes",
     *     "since": "20.0.0",
     *     "value": ["oj-accordion"]
     *   }
     * ]
     */
    const AccordionItemSingleImpl = ({ itemKey, expandedKey, onExpandedKeyChanged, children, ...otherProps }) => {
        const rootRef = (0, hooks_1.useRef)(null);
        const [newExpandedKey, setNewExpandedKey] = (0, hooks_1.useState)();
        (0, hooks_1.useLayoutEffect)(() => {
            if (onExpandedKeyChanged) {
                setNewExpandedKey(expandedKey);
                onExpandedKeyChanged(expandedKey);
            }
        }, [onExpandedKeyChanged, expandedKey]);
        const toggleHandler = (0, hooks_1.useCallback)(async (detail) => {
            setNewExpandedKey(detail.value);
            onExpandedKeyChanged?.(detail.value);
        }, [onExpandedKeyChanged]);
        const transitionEndHandler = (details) => {
            const fromKey = details.value?.from;
            const toKey = details.value?.to;
            if (toKey != null && toKey === itemKey) {
                otherProps.onOjExpand?.({ fromKey, toKey });
            }
            if (fromKey != null && fromKey === itemKey && toKey !== itemKey) {
                otherProps.onOjCollapse?.({ fromKey, toKey });
            }
        };
        return ((0, jsx_runtime_1.jsx)(ojvcomponent_1.Root, { ref: rootRef, children: (0, jsx_runtime_1.jsx)(UNSAFE_AccordionItemSingle_1.AccordionItemSingle, { itemKey: itemKey, expandedKey: newExpandedKey, "aria-label": otherProps['aria-label'], header: otherProps['header'], isDisabled: otherProps['disabled'], iconPosition: otherProps['iconPosition'], onChange: toggleHandler, onTransitionEnd: transitionEndHandler, children: children }, itemKey) }));
    };
    // This custom element supports generic parameters, but was introduced before the pattern for exposing
    // generic parameters on the functional value-based element was established.  In order to introduce the generics in
    // a backwards-compatible way, they must be defaulted, but we don't want the defaults to be added to the existing
    // types which had generics from the start.  The solution is to use two consts:
    //   * the first is not exported, but is used as the basis for the custom element types and does not default its generics
    //   * the second is the exported functional value-based element and defaults the generics for backwards compatibility
    const AccordionItemSingleWithoutDefaultedGenerics = (0, ojvcomponent_1.registerCustomElement)('oj-c-accordion-item-single', AccordionItemSingleImpl, "AccordionItemSingle", { "properties": { "itemKey": { "type": "string|number" }, "expandedKey": { "type": "string|number|null", "writeback": true }, "disabled": { "type": "boolean" }, "iconPosition": { "type": "string", "enumValues": ["end", "start"] } }, "slots": { "header": {}, "": {} }, "events": { "ojCollapse": {}, "ojExpand": {} }, "extension": { "_WRITEBACK_PROPS": ["expandedKey"], "_READ_ONLY_PROPS": [], "_OBSERVED_GLOBAL_PROPS": ["aria-label"] } }, undefined, {
        '@oracle/oraclejet-preact': translationBundle_1.default
    }, {
        consume: [UNSAFE_useTabbableMode_1.TabbableModeContext]
    });
    exports.AccordionItemSingle = AccordionItemSingleWithoutDefaultedGenerics;
});
