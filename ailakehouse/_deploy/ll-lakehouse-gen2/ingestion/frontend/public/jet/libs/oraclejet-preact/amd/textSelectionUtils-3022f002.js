define(['exports'], (function(e){"use strict";e.clearElementSelection=()=>{const e=document.getSelection();1===e?.anchorNode?.nodeType&&e.removeAllRanges()},e.getIsSelectionPending=()=>{const e=document.getSelection();return e&&!("None"===e.type||e.anchorNode===e.focusNode&&e.anchorOffset===e.focusOffset)}}));
//# sourceMappingURL=textSelectionUtils-3022f002.js.map
