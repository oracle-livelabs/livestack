/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { Group } from '@oracle/oraclejet-preact/utils/UNSAFE_visTypes/chart';
export type TimeAxisType = 'enabled' | 'mixedFrequency' | 'skipGaps' | undefined;
type Viewport = {
    xMin?: number;
    xMax?: number;
};
/**
 * Infers startGroup and endGroup from the given viewport (xMin/xMax), group list, and time axis type.
 * - For categorical/group axis: xMin/xMax are treated as index-space and snapped to ceil/floor.
 * - For time axis (enabled/skipGaps): group ids are parsed as time and the first >= xMin and last <= xMax are used.
 * - For mixedFrequency: groups are not aligned; falls back to ISO strings derived from xMin/xMax.
 */
export declare function computeStartEndGroup(viewport: Viewport | undefined, groups: Array<Group | any>, timeAxisType: TimeAxisType): {
    startGroup?: string;
    endGroup?: string;
};
export {};
