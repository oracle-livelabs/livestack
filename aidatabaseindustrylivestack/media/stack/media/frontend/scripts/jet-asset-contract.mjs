import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const DIRECT_JET_MODULES = Object.freeze([
  'ojbootstrap',
  'ojbutton',
  'ojinputtext',
  'ojselectsingle',
  'ojarraydataprovider',
  'ojswitch',
  'ojprogress-circle',
  'ojactioncard',
  'ojoption',
]);

export function requiredJetAssetPaths(oracleJetVersion) {
  if (typeof oracleJetVersion !== 'string'
      || !oracleJetVersion
      || /[\\/]/.test(oracleJetVersion)) {
    throw new Error(`Invalid Oracle JET version: ${oracleJetVersion}`);
  }
  return [
    'jet/bootstrap.js',
    'jet/redwood/oj-redwood-notag-min.css',
    'jet/libs/require/require.js',
    'jet/libs/knockout/knockout-3.5.1.debug.js',
    'jet/libs/jquery/jquery-3.7.1.js',
    'jet/libs/jquery/jqueryui-amd-1.14.1/widget.js',
    'jet/libs/hammer/hammer-2.0.8.js',
    'jet/libs/dnd-polyfill/dnd-polyfill-1.0.2.js',
    'jet/libs/js-signals/signals.js',
    'jet/libs/touchr/touchr.js',
    'jet/libs/require-css/css.js',
    'jet/libs/preact/dist/preact.umd.js',
    'jet/libs/oraclejet-preact/amd/UNSAFE_Button.js',
    'jet/libs/packs/oj-c/corepackbundle.js',
    `jet/libs/oj/${oracleJetVersion}/ojL10n.js`,
    `jet/libs/oj/${oracleJetVersion}/resources/nls/ojtranslations.js`,
    `jet/libs/oj/${oracleJetVersion}/debug/ojcss.js`,
    ...DIRECT_JET_MODULES.map(
      (moduleName) => `jet/libs/oj/${oracleJetVersion}/debug/${moduleName}.js`
    ),
  ];
}

export async function assertNonEmptyFiles(rootDir, relativePaths, label) {
  const invalid = [];
  for (const relativePath of relativePaths) {
    try {
      const fileStat = await stat(path.join(rootDir, relativePath));
      if (!fileStat.isFile() || fileStat.size === 0) {
        invalid.push(`${label}/${relativePath}`);
      }
    } catch (_) {
      invalid.push(`${label}/${relativePath}`);
    }
  }
  if (invalid.length) {
    throw new Error(`Missing or empty required build assets: ${invalid.join(', ')}`);
  }
}

export async function readPreparedOracleJetVersion(frontendDir) {
  const bootstrapPath = path.join(frontendDir, 'public/jet/bootstrap.js');
  const bootstrap = await readFile(bootstrapPath, 'utf8').catch((error) => {
    throw new Error(
      `Unable to read prepared Oracle JET bootstrap: ${error.message}`,
      { cause: error }
    );
  });
  const version = bootstrap.match(
    /\bojs:\s*['"]libs\/oj\/([^/'"]+)\/debug['"]/
  )?.[1];
  if (!version) {
    throw new Error('Prepared Oracle JET bootstrap has no valid versioned ojs path');
  }
  return version;
}

export async function assertPreparedJetAssets(frontendDir) {
  const oracleJetVersion = await readPreparedOracleJetVersion(frontendDir);
  const requiredAssets = requiredJetAssetPaths(oracleJetVersion);
  await assertNonEmptyFiles(
    path.join(frontendDir, 'public'),
    requiredAssets,
    'public'
  );
  return { oracleJetVersion, requiredAssets };
}

export async function assertApplicationBundles(distDir) {
  const assetDir = path.join(distDir, 'assets');
  const entries = await readdir(assetDir, { withFileTypes: true }).catch(
    () => []
  );
  const javascript = entries.filter(
    (entry) => entry.isFile() && /\.js$/i.test(entry.name)
  );
  const css = entries.filter(
    (entry) => entry.isFile() && /\.css$/i.test(entry.name)
  );
  if (!javascript.length || !css.length) {
    throw new Error(
      'Fresh frontend output must contain non-empty application JS and CSS bundles'
    );
  }
  await assertNonEmptyFiles(
    assetDir,
    [...javascript, ...css].map((entry) => entry.name),
    'dist/assets'
  );
}
