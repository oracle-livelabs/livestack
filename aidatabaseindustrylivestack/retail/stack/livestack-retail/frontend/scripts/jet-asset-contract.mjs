import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DIRECT_JET_MODULES = [
  'ojbootstrap',
  'ojbutton',
  'ojinputtext',
  'ojselectsingle',
  'ojarraydataprovider',
  'ojswitch',
  'ojprogress-circle',
  'ojactioncard',
  'ojoption',
];

export function requiredJetAssetPaths(oracleJetVersion) {
  if (
    typeof oracleJetVersion !== 'string'
    || oracleJetVersion.length === 0
    || oracleJetVersion.includes('/')
    || oracleJetVersion.includes('\\')
  ) {
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
      (moduleName) => `jet/libs/oj/${oracleJetVersion}/debug/${moduleName}.js`,
    ),
  ];
}

export async function assertNonEmptyFiles(rootDir, relativePaths, displayRoot) {
  const invalidPaths = [];

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(rootDir, relativePath);
    try {
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile() || fileStat.size === 0) {
        invalidPaths.push(`${displayRoot}/${relativePath}`);
      }
    } catch {
      invalidPaths.push(`${displayRoot}/${relativePath}`);
    }
  }

  if (invalidPaths.length > 0) {
    throw new Error(`Missing or empty required build assets: ${invalidPaths.join(', ')}`);
  }
}

export async function readPreparedOracleJetVersion(frontendDir) {
  const bootstrapPath = path.join(frontendDir, 'public', 'jet', 'bootstrap.js');
  let bootstrap;
  try {
    bootstrap = await readFile(bootstrapPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Unable to read prepared Oracle JET bootstrap at public/jet/bootstrap.js: ${error.message}`,
      { cause: error },
    );
  }

  const versionMatch = bootstrap.match(/\bojs:\s*['"]libs\/oj\/([^/'"]+)\/debug['"]/);
  if (!versionMatch) {
    throw new Error('Prepared Oracle JET bootstrap does not declare a valid versioned ojs path.');
  }
  return versionMatch[1];
}

export async function assertPreparedJetAssets(frontendDir) {
  const oracleJetVersion = await readPreparedOracleJetVersion(frontendDir);
  const requiredAssets = requiredJetAssetPaths(oracleJetVersion);
  await assertNonEmptyFiles(
    path.join(frontendDir, 'public'),
    requiredAssets,
    'public',
  );
  return { oracleJetVersion, requiredAssets };
}
