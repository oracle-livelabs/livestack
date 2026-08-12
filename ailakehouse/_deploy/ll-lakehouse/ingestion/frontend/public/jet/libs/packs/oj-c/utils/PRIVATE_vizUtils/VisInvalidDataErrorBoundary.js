define(["require", "exports", "preact/jsx-runtime", "preact/hooks", "@oracle/oraclejet-preact/UNSAFE_VisInvalidDataMessage", "@oracle/oraclejet-preact/UNSAFE_visErrors"], function (require, exports, jsx_runtime_1, hooks_1, UNSAFE_VisInvalidDataMessage_1, UNSAFE_visErrors_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.VisInvalidDataErrorBoundary = VisInvalidDataErrorBoundary;
    /**
     * If a VisInvalidDataError rendering error is thrown in a child visualization due to invalid data, renders VisInvalidData.
     */
    function VisInvalidDataErrorBoundary({ children, dependencies, width = '100%', height = '100%', ...rest }) {
        const [error, resetError] = (0, hooks_1.useErrorBoundary)();
        // Allow children re-render when values relevant to invalid data determination changes
        (0, hooks_1.useEffect)(() => {
            if (error instanceof UNSAFE_visErrors_1.VisInvalidDataError) {
                resetError();
            }
        }, dependencies);
        return error instanceof UNSAFE_visErrors_1.VisInvalidDataError ? ((0, jsx_runtime_1.jsx)(UNSAFE_VisInvalidDataMessage_1.VisInvalidDataMessage, { width: width, height: height, ...rest })) : ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: children }));
    }
});
