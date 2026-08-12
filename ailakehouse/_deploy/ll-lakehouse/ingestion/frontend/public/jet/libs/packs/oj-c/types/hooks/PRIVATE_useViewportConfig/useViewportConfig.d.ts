/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import type { ViewportConfig } from '@oracle/oraclejet-preact/hooks/UNSAFE_useViewportIntersect';
export declare const useViewportConfig: (scrollPolicyOptions?: {
    scroller?: string;
}) => {
    viewportConfig: ViewportConfig | undefined;
};
