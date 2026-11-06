define(['exports'], (function(t){"use strict";t.getLineAreaChartItemPosition=(t,e,r,n,i,o,s,f,a)=>{const m=r[t][e];if(null==m)return;let u=e;if(a){const r="mixedFrequency"===a?n(t,e)?.x:i[e].id;u=new Date(r).getTime()}return{x:o?f.transform(m):s.transform(u),y:o?s.transform(u):f.transform(m),height:0,width:0}}}));
//# sourceMappingURL=chartUtils-2415ea65.js.map
