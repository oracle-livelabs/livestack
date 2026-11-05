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
    exports.getGroupData = getGroupData;
    function getGroupData(groupPath, groups) {
        if (!groupPath) {
            return [];
        }
        const groupData = [];
        let _groups = groups;
        groupPath.forEach((i) => {
            if (_groups?.[i]) {
                groupData.push(_groups[i]);
            }
            _groups = _groups?.[i].groups;
        });
        return groupData;
    }
});
