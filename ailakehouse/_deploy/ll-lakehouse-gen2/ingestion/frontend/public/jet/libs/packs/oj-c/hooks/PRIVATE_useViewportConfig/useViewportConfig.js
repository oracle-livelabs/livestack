define(["require", "exports", "preact/hooks"], function (require, exports, hooks_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.useViewportConfig = void 0;
    const useViewportConfig = (scrollPolicyOptions) => {
        const initialConfig = scrollPolicyOptions?.scroller != null ? { scrollerRef: { current: null } } : undefined;
        // keep track of the most recent viewportConfig to avoid instance changes due to offset updates
        const viewportConfigRef = (0, hooks_1.useRef)(initialConfig);
        const [viewportConfig, setViewportConfig] = (0, hooks_1.useState)(initialConfig);
        (0, hooks_1.useLayoutEffect)(() => {
            if (scrollPolicyOptions?.scroller != null) {
                const config = {
                    scrollerRef: {
                        current: document.querySelector(scrollPolicyOptions.scroller)
                    }
                };
                // only update viewportConfig (and scrollerRef) instance if resulting element actually changed
                if (viewportConfigRef.current?.scrollerRef.current !== config.scrollerRef.current) {
                    setViewportConfig(config);
                    viewportConfigRef.current = config;
                }
            }
            else {
                setViewportConfig(undefined);
                viewportConfigRef.current = undefined;
            }
        }, [scrollPolicyOptions]);
        return { viewportConfig };
    };
    exports.useViewportConfig = useViewportConfig;
});
