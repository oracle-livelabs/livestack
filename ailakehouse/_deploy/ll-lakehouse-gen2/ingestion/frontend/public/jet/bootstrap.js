(function () {
  const requireImpl = window.requirejs || window.require;
  if (!requireImpl) return;
  window.__jetReady = false;
  document.documentElement.dataset.jetReady = 'false';

  requireImpl.config({
    baseUrl: '/jet',
    paths: {
      knockout: 'libs/knockout/knockout-3.5.1.debug',
      jquery: 'libs/jquery/jquery-3.7.1',
      'jqueryui-amd': 'libs/jquery/jqueryui-amd-1.14.1',
      hammerjs: 'libs/hammer/hammer-2.0.8',
      ojdnd: 'libs/dnd-polyfill/dnd-polyfill-1.0.2',
      ojs: 'libs/oj/20.0.2/debug',
      ojL10n: 'libs/oj/20.0.2/ojL10n',
      ojtranslations: 'libs/oj/20.0.2/resources',
      '@oracle/oraclejet-preact': 'libs/oraclejet-preact/amd',
      'oj-c': 'libs/packs/oj-c',
      persist: 'libs/persist/debug',
      text: 'libs/require/text',
      signals: 'libs/js-signals/signals',
      touchr: 'libs/touchr/touchr',
      preact: 'libs/preact/dist/preact.umd',
      'preact/hooks': 'libs/preact/hooks/dist/hooks.umd',
      'preact/compat': 'libs/preact/compat/dist/compat.umd',
      'preact/jsx-runtime': 'libs/preact/jsx-runtime/dist/jsxRuntime.umd',
      'preact/debug': 'libs/preact/debug/dist/debug.umd',
      'preact/devtools': 'libs/preact/devtools/dist/devtools.umd',
      css: 'libs/require-css/css',
      ojcss: 'libs/oj/20.0.2/debug/ojcss',
      'ojs/ojcss': 'libs/oj/20.0.2/debug/ojcss',
      chai: 'libs/chai/chai',
      'css-builder': 'libs/require-css/css-builder',
      normalize: 'libs/require-css/normalize',
      'ojs/normalize': 'libs/require-css/normalize',
    },
  });

  requireImpl([
    'ojs/ojbootstrap',
    'ojs/ojbutton',
    'ojs/ojinputtext',
    'ojs/ojselectsingle',
    'ojs/ojarraydataprovider',
    'ojs/ojswitch',
    'ojs/ojprogress-circle',
    'ojs/ojactioncard',
    'ojs/ojoption',
  ], function (Bootstrap) {
    const start = () => {
      window.__jetReady = true;
      document.documentElement.dataset.jetReady = 'true';
      window.dispatchEvent(new Event('resize'));
    };
    if (Bootstrap?.whenDocumentReady) {
      Bootstrap.whenDocumentReady().then(start);
    } else {
      start();
    }
  }, function (err) {
    document.documentElement.dataset.jetError = (err && (err.requireModules || [err.message]).join(',')) || 'unknown';
  });
}());
