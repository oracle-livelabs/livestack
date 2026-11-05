/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { ComponentChildren, ComponentProps } from 'preact';
import { VisInvalidDataMessage } from '@oracle/oraclejet-preact/UNSAFE_VisInvalidDataMessage';
type VisInvalidDataErrorBoundaryProps = ComponentProps<typeof VisInvalidDataMessage> & {
    children: ComponentChildren;
    dependencies: unknown[];
};
/**
 * If a VisInvalidDataError rendering error is thrown in a child visualization due to invalid data, renders VisInvalidData.
 */
export declare function VisInvalidDataErrorBoundary({ children, dependencies, width, height, ...rest }: VisInvalidDataErrorBoundaryProps): import("preact").JSX.Element;
export {};
