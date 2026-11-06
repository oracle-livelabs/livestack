define(["require", "exports", "preact/hooks"], function (require, exports, hooks_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.useCurrentCellOverride = void 0;
    /**
     * This hook mirrors useCurrentItemOverride for ListView, but for Table cells.
     *
     * If the app provides a new value for 'currentCellOverride', we pass that down to
     * the preact TableView. Otherwise, we pass the internal override value, which
     * can be updated by useHandleRemoveCurrentKey when a row is removed.
     *
     * Additionally, we remember the last persisted current cell (rowKey + columnKey + type)
     * so that when a row is deleted, we can move current cell to the same column
     * in the next/previous row.
     */
    const useCurrentCellOverride = (currentCellOverride) => {
        // What actually goes into preact Table
        const preactOverrideRef = (0, hooks_1.useRef)();
        // Internal override we set when a row gets removed
        const [, setInternalOverride] = (0, hooks_1.useState)();
        // Last data cell that TableView told us about
        const lastPersistedCellRef = (0, hooks_1.useRef)();
        const recordPersistedCell = (0, hooks_1.useCallback)((cell) => {
            lastPersistedCellRef.current = cell;
        }, []);
        // Called when the current row is deleted and useHandleRemoveCurrentKey has chosen a neighbour row key.
        const onCurrentRowOverride = (0, hooks_1.useCallback)((rowKey) => {
            const base = lastPersistedCellRef.current;
            const cellOverride = {
                rowKey,
                columnKey: base?.columnKey,
                type: 'data'
            };
            setInternalOverride(cellOverride);
            preactOverrideRef.current = cellOverride;
        }, []);
        // Track app-provided currentCellOverride
        const currentCellOverrideRef = (0, hooks_1.useRef)();
        if (currentCellOverrideRef.current !== currentCellOverride) {
            currentCellOverrideRef.current = currentCellOverride;
            preactOverrideRef.current = currentCellOverrideRef.current;
        }
        return {
            preactCurrentCellOverride: preactOverrideRef.current,
            onCurrentRowOverride,
            recordPersistedCell
        };
    };
    exports.useCurrentCellOverride = useCurrentCellOverride;
});
