import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  assertApplicationBundles,
  assertNonEmptyFiles,
  assertPreparedJetAssets,
} from './jet-asset-contract.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultFrontendDir = path.resolve(scriptDir, '..');

export class BuildPhaseError extends Error {
  constructor(message, { phase, exitCode = 1, cause } = {}) {
    super(message, { cause });
    this.name = 'BuildPhaseError';
    this.phase = phase;
    this.exitCode = exitCode;
  }
}

async function requireRunnableFile(filePath, phase) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || fileStat.size === 0) {
      throw new Error('path is not a non-empty file');
    }
  } catch (error) {
    throw new BuildPhaseError(
      `${phase} cannot start because ${filePath} is missing or empty`,
      { phase, cause: error }
    );
  }
}

function runNodePhase({
  phase,
  nodeExecutable,
  scriptPath,
  args = [],
  cwd,
  stdio,
}) {
  const result = spawnSync(nodeExecutable, [scriptPath, ...args], {
    cwd,
    encoding: stdio === 'pipe' ? 'utf8' : undefined,
    stdio,
  });
  if (result.error) {
    throw new BuildPhaseError(
      `${phase} could not be started: ${result.error.message}`,
      { phase, cause: result.error }
    );
  }
  if (result.status !== 0) {
    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    const detail = [result.stderr, result.stdout]
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim())
      .join('\n');
    throw new BuildPhaseError(
      `${phase} failed with exit code ${exitCode}${detail ? `:\n${detail}` : ''}`,
      { phase, exitCode }
    );
  }
}

async function removeFinderMetadata(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(
    (error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  );
  await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) return removeFinderMetadata(entryPath);
    if (entry.name === '.DS_Store') await rm(entryPath, { force: true });
    return undefined;
  }));
}

async function listBuildInputs(frontendDir, relativePath) {
  const absolutePath = path.join(frontendDir, relativePath);
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch (_) {
    return [];
  }
  if (fileStat.isFile()) return [relativePath];
  if (!fileStat.isDirectory()) return [];
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter((entry) => !['node_modules', 'dist', 'public'].includes(entry.name))
    .map((entry) => listBuildInputs(
      frontendDir,
      path.posix.join(relativePath, entry.name)
    )));
  return nested.flat();
}

async function writeBuildIdentity(frontendDir, distDir) {
  const inputs = (await Promise.all([
    'package.json',
    'package-lock.json',
    'index.html',
    'postcss.config.js',
    'tailwind.config.js',
    'vite.config.js',
    'src',
    'scripts',
  ].map((entry) => listBuildInputs(frontendDir, entry))))
    .flat()
    .sort();
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for (const relativePath of inputs) {
    const content = await readFile(path.join(frontendDir, relativePath));
    bytes += content.length;
    hash.update(relativePath);
    hash.update('\0');
    hash.update(String(content.length));
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }
  const identity = {
    schemaVersion: 1,
    sha256: hash.digest('hex'),
    fileCount: inputs.length,
    bytes,
  };
  await writeFile(
    path.join(distDir, 'build-identity.json'),
    `${JSON.stringify(identity, null, 2)}\n`,
    'utf8'
  );
  return identity;
}

export async function buildFrontend({
  frontendDir = defaultFrontendDir,
  prepareScript = path.join(frontendDir, 'scripts/prepare-jet-assets.mjs'),
  viteEntry = path.join(frontendDir, 'node_modules/vite/bin/vite.js'),
  requiredJetAssets,
  requireApplicationBundles = true,
  nodeExecutable = process.execPath,
  stdio = 'inherit',
  logger = console,
} = {}) {
  const resolvedFrontendDir = path.resolve(frontendDir);
  const distDir = path.join(resolvedFrontendDir, 'dist');
  await rm(distDir, { recursive: true, force: true });

  await requireRunnableFile(prepareScript, 'Oracle JET asset preparation');
  runNodePhase({
    phase: 'Oracle JET asset preparation',
    nodeExecutable,
    scriptPath: prepareScript,
    cwd: resolvedFrontendDir,
    stdio,
  });

  let assets = requiredJetAssets;
  if (assets === undefined) {
    ({ requiredAssets: assets } = await assertPreparedJetAssets(
      resolvedFrontendDir
    ));
  } else {
    await assertNonEmptyFiles(
      path.join(resolvedFrontendDir, 'public'),
      assets,
      'public'
    );
  }

  await requireRunnableFile(viteEntry, 'Vite build');
  runNodePhase({
    phase: 'Vite build',
    nodeExecutable,
    scriptPath: viteEntry,
    args: ['build'],
    cwd: resolvedFrontendDir,
    stdio,
  });

  await removeFinderMetadata(distDir);
  const buildIdentity = await writeBuildIdentity(resolvedFrontendDir, distDir);
  await assertNonEmptyFiles(
    distDir,
    ['index.html', 'build-identity.json', ...assets],
    'dist'
  );
  if (requireApplicationBundles) await assertApplicationBundles(distDir);
  logger.log(
    `Media frontend build passed: fresh index, application bundles, and ` +
      `${assets.length} Oracle JET assets verified; build input ` +
      `${buildIdentity.sha256}.`
  );
}

const invokedAsMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsMain) {
  try {
    await buildFrontend();
  } catch (error) {
    console.error(`Media frontend build failed: ${error.message}`);
    process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
  }
}
