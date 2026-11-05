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
    exports.computeStartEndGroup = computeStartEndGroup;
    /**
     * Extracts a stable id from a group entry.
     * Group can be a primitive or an object like { id: string }.
     */
    const extractGroupId = (g) => (g && typeof g === 'object' && 'id' in g ? g.id : g);
    /**
     * Converts a date-like value to epoch millis. Returns undefined if not parsable.
     */
    const toMillis = (val) => {
        if (typeof val === 'number')
            return val;
        const t = Date.parse(String(val));
        return isNaN(t) ? undefined : t;
    };
    /**
     * Infers startGroup and endGroup from the given viewport (xMin/xMax), group list, and time axis type.
     * - For categorical/group axis: xMin/xMax are treated as index-space and snapped to ceil/floor.
     * - For time axis (enabled/skipGaps): group ids are parsed as time and the first >= xMin and last <= xMax are used.
     * - For mixedFrequency: groups are not aligned; falls back to ISO strings derived from xMin/xMax.
     */
    function computeStartEndGroup(viewport, groups, timeAxisType) {
        if (!viewport)
            return {};
        const { xMin, xMax } = viewport;
        // Mixed frequency: fallback to ISO strings from numeric bounds
        if (timeAxisType === 'mixedFrequency') {
            if (xMin != null && xMax != null) {
                return {
                    startGroup: new Date(xMin).toISOString(),
                    endGroup: new Date(xMax).toISOString()
                };
            }
            return {};
        }
        // Time axis (enabled/skipGaps): ids parsed as time
        if (timeAxisType === 'enabled' || timeAxisType === 'skipGaps') {
            const ids = groups.map((group) => group.id);
            const ts = ids.map(toMillis);
            if (xMin == null || xMax == null || ids.length === 0)
                return {};
            let startIdx = 0;
            let endIdx = ids.length - 1;
            for (let i = 0; i < ts.length; i++) {
                const t = ts[i];
                if (t != null && t >= xMin) {
                    startIdx = i;
                    break;
                }
            }
            for (let i = ts.length - 1; i >= 0; i--) {
                const t = ts[i];
                if (t != null && t <= xMax) {
                    endIdx = i;
                    break;
                }
            }
            startIdx = Math.max(0, Math.min(startIdx, ids.length - 1));
            endIdx = Math.max(0, Math.min(endIdx, ids.length - 1));
            return {
                startGroup: String(ids[startIdx]),
                endGroup: String(ids[endIdx])
            };
        }
        // Categorical/group axis
        const count = groups.length;
        if (count === 0 || xMin == null || xMax == null)
            return {};
        let startIdx = Math.max(0, Math.ceil(xMin));
        let endIdx = Math.min(count - 1, Math.floor(xMax));
        if (endIdx < startIdx) {
            const tmp = startIdx;
            startIdx = endIdx;
            endIdx = tmp;
        }
        const startId = extractGroupId(groups[startIdx]);
        const endId = extractGroupId(groups[endIdx]);
        return { startGroup: String(startId), endGroup: String(endId) };
    }
});
