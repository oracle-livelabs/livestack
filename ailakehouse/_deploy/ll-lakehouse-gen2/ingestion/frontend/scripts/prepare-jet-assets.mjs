import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const nodeModules = path.join(frontendRoot, 'node_modules');
const publicJetRoot = path.join(frontendRoot, 'public', 'jet');
const oracleJetRoot = path.join(nodeModules, '@oracle', 'oraclejet');
const oracleJetLibs = path.join(oracleJetRoot, 'dist', 'js', 'libs');
const jetVersion = '20.0.2';

const directoryAssets = [
  {
    label: 'JET Redwood theme',
    source: path.join(oracleJetRoot, 'dist', 'css', 'redwood'),
    destination: path.join(publicJetRoot, 'redwood'),
    sentinel: 'oj-redwood-notag-min.css',
  },
  {
    label: 'JET AMD runtime',
    source: path.join(oracleJetLibs, 'oj'),
    destination: path.join(publicJetRoot, 'libs', 'oj', jetVersion),
    sentinel: path.join('debug', 'ojbootstrap.js'),
  },
  {
    label: 'Oracle JET Preact AMD runtime',
    source: path.join(nodeModules, '@oracle', 'oraclejet-preact', 'amd'),
    destination: path.join(publicJetRoot, 'libs', 'oraclejet-preact', 'amd'),
    sentinel: 'UNSAFE_Button.js',
  },
  {
    label: 'Offline persistence runtime',
    source: path.join(oracleJetLibs, 'persist'),
    destination: path.join(publicJetRoot, 'libs', 'persist'),
    sentinel: path.join('debug', 'persistenceManager.js'),
  },
  {
    label: 'jQuery UI AMD runtime',
    source: path.join(oracleJetLibs, 'jquery', 'jqueryui-amd-1.14.1'),
    destination: path.join(publicJetRoot, 'libs', 'jquery', 'jqueryui-amd-1.14.1'),
    sentinel: 'widget.js',
  },
  {
    label: 'RequireJS CSS plugin',
    source: path.join(oracleJetLibs, 'require-css'),
    destination: path.join(publicJetRoot, 'libs', 'require-css'),
    sentinel: 'css.js',
  },
  {
    label: 'JET drag and drop polyfill',
    source: path.join(oracleJetLibs, 'dnd-polyfill'),
    destination: path.join(publicJetRoot, 'libs', 'dnd-polyfill'),
    sentinel: 'dnd-polyfill-1.0.2.js',
  },
  {
    label: 'JET touch runtime',
    source: path.join(oracleJetLibs, 'touchr'),
    destination: path.join(publicJetRoot, 'libs', 'touchr'),
    sentinel: 'touchr.js',
  },
  {
    label: 'Preact runtime',
    source: path.join(nodeModules, 'preact', 'dist'),
    destination: path.join(publicJetRoot, 'libs', 'preact', 'dist'),
    sentinel: 'preact.umd.js',
  },
  {
    label: 'Preact hooks runtime',
    source: path.join(nodeModules, 'preact', 'hooks'),
    destination: path.join(publicJetRoot, 'libs', 'preact', 'hooks'),
    sentinel: path.join('dist', 'hooks.umd.js'),
  },
  {
    label: 'Preact compat runtime',
    source: path.join(nodeModules, 'preact', 'compat'),
    destination: path.join(publicJetRoot, 'libs', 'preact', 'compat'),
    sentinel: path.join('dist', 'compat.umd.js'),
  },
  {
    label: 'Preact JSX runtime',
    source: path.join(nodeModules, 'preact', 'jsx-runtime'),
    destination: path.join(publicJetRoot, 'libs', 'preact', 'jsx-runtime'),
    sentinel: path.join('dist', 'jsxRuntime.umd.js'),
  },
  {
    label: 'Preact debug runtime',
    source: path.join(nodeModules, 'preact', 'debug'),
    destination: path.join(publicJetRoot, 'libs', 'preact', 'debug'),
    sentinel: path.join('dist', 'debug.umd.js'),
  },
  {
    label: 'Preact devtools runtime',
    source: path.join(nodeModules, 'preact', 'devtools'),
    destination: path.join(publicJetRoot, 'libs', 'preact', 'devtools'),
    sentinel: path.join('dist', 'devtools.umd.js'),
  },
];

const fileAssets = [
  {
    label: 'RequireJS',
    source: path.join(nodeModules, 'requirejs', 'require.js'),
    destination: path.join(publicJetRoot, 'libs', 'require', 'require.js'),
  },
  {
    label: 'RequireJS text plugin',
    source: path.join(nodeModules, 'requirejs-text', 'text.js'),
    destination: path.join(publicJetRoot, 'libs', 'require', 'text.js'),
  },
  {
    label: 'jQuery',
    source: path.join(nodeModules, 'jquery', 'dist', 'jquery.js'),
    destination: path.join(publicJetRoot, 'libs', 'jquery', 'jquery-3.7.1.js'),
  },
  {
    label: 'Knockout',
    source: path.join(nodeModules, 'knockout', 'build', 'output', 'knockout-latest.debug.js'),
    destination: path.join(publicJetRoot, 'libs', 'knockout', 'knockout-3.5.1.debug.js'),
  },
  {
    label: 'HammerJS',
    source: path.join(nodeModules, 'hammerjs', 'hammer.js'),
    destination: path.join(publicJetRoot, 'libs', 'hammer', 'hammer-2.0.8.js'),
  },
  {
    label: 'js-signals',
    source: path.join(nodeModules, 'signals', 'dist', 'signals.js'),
    destination: path.join(publicJetRoot, 'libs', 'js-signals', 'signals.js'),
  },
];

async function exists(target) {
  try {
    await fs.access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectoryIfMissing({ label, source, destination, sentinel }) {
  const sentinelPath = path.join(destination, sentinel);
  if (await exists(sentinelPath)) return false;

  if (!(await exists(source))) {
    throw new Error(`${label} source is missing: ${path.relative(frontendRoot, source)}`);
  }

  await fs.rm(destination, { force: true, recursive: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true });
  return true;
}

async function copyFileIfMissing({ label, source, destination }) {
  if (await exists(destination)) return false;

  if (!(await exists(source))) {
    throw new Error(`${label} source is missing: ${path.relative(frontendRoot, source)}`);
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  return true;
}

let generatedCount = 0;

for (const asset of directoryAssets) {
  if (await copyDirectoryIfMissing(asset)) generatedCount += 1;
}

for (const asset of fileAssets) {
  if (await copyFileIfMissing(asset)) generatedCount += 1;
}

if (generatedCount) {
  console.log(`Prepared ${generatedCount} JET static asset groups.`);
} else {
  console.log('JET static assets already prepared.');
}
