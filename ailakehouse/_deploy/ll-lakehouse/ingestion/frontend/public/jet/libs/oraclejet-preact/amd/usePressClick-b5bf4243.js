define(['exports', 'preact/hooks'], (function(e,s){"use strict";const o={isDisabled:!1},t=e=>{"Enter"!==e.code&&"Space"!==e.code||!e.repeat||e.preventDefault()};e.usePressClick=function(e,n=o){const c=s.useCallback((s=>{s.stopPropagation(),e(s)}),[e]);return{pressProps:n?.isDisabled?{}:{onClick:c,onKeyDown:t}}}}));
//# sourceMappingURL=usePressClick-b5bf4243.js.map
