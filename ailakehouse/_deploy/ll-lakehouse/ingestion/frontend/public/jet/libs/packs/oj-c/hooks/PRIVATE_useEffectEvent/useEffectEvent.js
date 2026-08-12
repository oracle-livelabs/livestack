define(["require", "exports", "preact/hooks"], function (require, exports, hooks_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.useEffectEvent = useEffectEvent;
    /**
     * A polyfill for react's experimental_useEffectEvent
     * See https://react.dev/reference/react/experimental_useEffectEvent
     *
     * @param callback The event function that needs to be wrapped
     * @returns A non-reactive function that always “sees” the latest values of your props and state.
     */
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    function useEffectEvent(callback) {
        const fnRef = (0, hooks_1.useRef)(callback);
        fnRef.current = callback;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (0, hooks_1.useCallback)((...args) => {
            return fnRef.current.apply(null, args);
        }, []);
    }
});
