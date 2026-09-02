'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const APPLICATION_ID = 'livestack-media';
const COMPOSE_PROJECT = 'livestack-media';
const COMPOSE_SERVICE = 'app';
const STABLE_CONTAINER = 'livestack-media-app-1';
const RUNTIME_SOURCE_BINDING_RELATIVE_PATH =
  'backend/runtime-frozen-source-identity.json';
const RUNTIME_EXECUTABLE_MANIFEST_RELATIVE_PATH =
  'verification/runtime/media-runtime-executable-manifest.json';
const FULL_SOURCE_MARKER_RELATIVE_PATH =
  'verification/generate-media-source-freeze.js';
const SOURCE_AGGREGATE_DEFINITION =
  'sha256(lexicographically sorted shasum -a 256 lines with relative ./ paths)';
const SOURCE_EXCLUSIONS = Object.freeze([
  '**/node_modules/**',
  'frontend/dist/**',
  'frontend/public/jet/**',
  RUNTIME_SOURCE_BINDING_RELATIVE_PATH,
  RUNTIME_EXECUTABLE_MANIFEST_RELATIVE_PATH,
  '**/logs/**',
  '**/evidence/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/*.log',
  '**/.DS_Store',
  '**/*.zip',
]);
const REQUIRED_DISTRIBUTABLE_PATHS = Object.freeze([
  '.env',
  '.env.example',
  'README.md',
  'Containerfile',
  'compose.yml',
  'package.json',
  'package-lock.json',
  'backend',
  'db',
  'scripts',
  'verification',
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/index.html',
  'frontend/scripts',
  'frontend/src',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function posixRelative(rootDir, absolutePath) {
  return path.relative(rootDir, absolutePath).split(path.sep).join('/');
}

function isExcludedSourcePath(relativePath, isDirectory = false) {
  const normalized = String(relativePath || '')
    .split(path.sep)
    .join('/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
  if (!normalized) return false;
  const segments = normalized.split('/');
  if (segments.includes('node_modules')) return true;
  if (segments.includes('logs')
      || segments.includes('evidence')
      || segments.includes('coverage')
      || segments.includes('.cache')) {
    return true;
  }
  if (normalized === 'frontend/dist'
      || normalized.startsWith('frontend/dist/')
      || normalized === 'frontend/public/jet'
      || normalized.startsWith('frontend/public/jet/')) {
    return true;
  }
  if (normalized === RUNTIME_SOURCE_BINDING_RELATIVE_PATH
      || normalized === RUNTIME_EXECUTABLE_MANIFEST_RELATIVE_PATH) {
    return true;
  }
  if (isDirectory) return false;
  const basename = path.posix.basename(normalized);
  return basename === '.DS_Store'
    || basename.endsWith('.log')
    || basename.endsWith('.zip');
}

function listFrozenSourceFiles(rootDir, directory = rootDir) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = posixRelative(rootDir, absolutePath);
      if (isExcludedSourcePath(relativePath, entry.isDirectory())) return [];
      if (entry.isDirectory()) {
        return listFrozenSourceFiles(rootDir, absolutePath);
      }
      return entry.isFile() ? [relativePath] : [];
    })
    .sort((left, right) => (
      Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
    ));
}

function assertCompleteDistributableTree(rootDir) {
  const requiredPaths = [
    ...REQUIRED_DISTRIBUTABLE_PATHS,
    FULL_SOURCE_MARKER_RELATIVE_PATH,
  ];
  const missing = requiredPaths.filter(
    (relativePath) => !fs.existsSync(path.join(rootDir, relativePath))
  );
  if (missing.length > 0) {
    throw new Error(
      `Full Media distributable tree is incomplete; missing ${missing.join(', ')}`
    );
  }
}

function hasCompleteDistributableTree(rootDir) {
  return fs.existsSync(path.join(rootDir, FULL_SOURCE_MARKER_RELATIVE_PATH))
    && REQUIRED_DISTRIBUTABLE_PATHS.every(
    (relativePath) => fs.existsSync(path.join(rootDir, relativePath))
  );
}

function computeFrozenSourceIdentity(rootDir) {
  assertCompleteDistributableTree(rootDir);
  const files = listFrozenSourceFiles(rootDir);
  const aggregate = crypto.createHash('sha256');
  let bytes = 0;
  for (const relativePath of files) {
    const content = fs.readFileSync(path.join(rootDir, relativePath));
    bytes += content.length;
    aggregate.update(
      `${sha256(content)}  ./${relativePath}\n`,
      'utf8'
    );
  }
  return Object.freeze({
    sha256: aggregate.digest('hex'),
    fileCount: files.length,
    bytes,
    aggregateDefinition: SOURCE_AGGREGATE_DEFINITION,
    exclusions: SOURCE_EXCLUSIONS,
  });
}

function listFiles(rootDir, relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [relativePath];
  return fs.readdirSync(absolutePath, { withFileTypes: true })
    .flatMap((entry) => {
      const childPath = path.posix.join(relativePath, entry.name);
      return entry.isDirectory()
        ? listFiles(rootDir, childPath)
        : entry.isFile()
          ? [childPath]
          : [];
    });
}

function hashFileSet(rootDir, relativePaths) {
  const files = relativePaths
    .flatMap((relativePath) => listFiles(rootDir, relativePath))
    .filter((relativePath) => path.posix.basename(relativePath) !== '.DS_Store')
    .sort((left, right) => (
      Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
    ));
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for (const relativePath of files) {
    const content = fs.readFileSync(path.join(rootDir, relativePath));
    bytes += content.length;
    hash.update(relativePath);
    hash.update('\0');
    hash.update(String(content.length));
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }
  return {
    sha256: hash.digest('hex'),
    fileCount: files.length,
    bytes,
  };
}

function assertSha256(value, label) {
  if (!/^[0-9a-f]{64}$/i.test(String(value || ''))) {
    throw new Error(`${label} must be an exact SHA-256 digest`);
  }
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function readJson(absolutePath, label) {
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function validateSourceBinding(binding) {
  if (binding.schemaVersion !== 1
      || binding.applicationId !== APPLICATION_ID
      || binding.project !== COMPOSE_PROJECT
      || binding.service !== COMPOSE_SERVICE
      || binding.stableContainer !== STABLE_CONTAINER) {
    throw new Error('Embedded source binding does not describe the stable Media target');
  }
  assertSha256(binding.source?.sha256, 'binding.source.sha256');
  assertPositiveInteger(binding.source?.fileCount, 'binding.source.fileCount');
  assertPositiveInteger(binding.source?.bytes, 'binding.source.bytes');
  if (binding.source.aggregateDefinition !== SOURCE_AGGREGATE_DEFINITION) {
    throw new Error('Embedded source binding uses a different aggregate definition');
  }
  if (JSON.stringify(binding.source.exclusions) !== JSON.stringify(SOURCE_EXCLUSIONS)) {
    throw new Error('Embedded source binding uses a different exclusion policy');
  }
  assertSha256(
    binding.frontendBuild?.sha256,
    'binding.frontendBuild.sha256'
  );
  assertPositiveInteger(
    binding.frontendBuild?.fileCount,
    'binding.frontendBuild.fileCount'
  );
  assertPositiveInteger(
    binding.frontendBuild?.bytes,
    'binding.frontendBuild.bytes'
  );
  assertSha256(
    binding.frontendBundle?.sha256,
    'binding.frontendBundle.sha256'
  );
  assertPositiveInteger(
    binding.frontendBundle?.fileCount,
    'binding.frontendBundle.fileCount'
  );
  assertPositiveInteger(
    binding.frontendBundle?.bytes,
    'binding.frontendBundle.bytes'
  );
  for (const [relativePath, digest] of Object.entries(
    binding.immutableRuntime || {}
  )) {
    assertSha256(digest, `binding.immutableRuntime.${relativePath}`);
  }
  return binding;
}

function assertSameIdentity(actual, expected, label) {
  for (const key of ['sha256', 'fileCount', 'bytes']) {
    if (actual?.[key] !== expected?.[key]) {
      throw new Error(
        `${label} mismatch for ${key}: expected ${expected?.[key]}, got ${actual?.[key]}`
      );
    }
  }
}

function hasSameIdentity(actual, expected) {
  return ['sha256', 'fileCount', 'bytes'].every(
    (key) => actual?.[key] === expected?.[key]
  );
}

function loadRuntimeSourceBinding(rootDir) {
  const absolutePath = path.join(
    rootDir,
    ...RUNTIME_SOURCE_BINDING_RELATIVE_PATH.split('/')
  );
  if (!fs.existsSync(absolutePath)) return null;
  return validateSourceBinding(
    readJson(absolutePath, RUNTIME_SOURCE_BINDING_RELATIVE_PATH)
  );
}

function computeRuntimeIdentity(rootDir = path.resolve(__dirname, '../..')) {
  const packageJson = readJson(
    path.join(rootDir, 'package.json'),
    'package.json'
  );
  const metadata = packageJson.livestack;
  if (metadata?.id !== APPLICATION_ID
      || metadata?.industry !== 'media'
      || !metadata?.image) {
    throw new Error(
      'package.json must define the stable Media LiveStack id, industry, and image'
    );
  }

  const completeSource = hasCompleteDistributableTree(rootDir);
  const binding = loadRuntimeSourceBinding(rootDir);
  let source;
  let bindingMatchesSource = false;
  if (completeSource) {
    source = computeFrozenSourceIdentity(rootDir);
    bindingMatchesSource = Boolean(
      binding && hasSameIdentity(source, binding.source)
    );
  } else {
    if (!binding) {
      throw new Error(
        `${RUNTIME_SOURCE_BINDING_RELATIVE_PATH} is required in the runtime image`
      );
    }
    source = Object.freeze({ ...binding.source });
  }

  const frontendDist = path.join(rootDir, 'frontend/dist');
  if (!fs.existsSync(frontendDist)) {
    throw new Error('frontend/dist is required for exact runtime identity');
  }
  const frontendBundle = Object.freeze(
    hashFileSet(rootDir, ['frontend/dist'])
  );
  const frontendBuild = readJson(
    path.join(frontendDist, 'build-identity.json'),
    'frontend/dist/build-identity.json'
  );
  assertSha256(frontendBuild.sha256, 'frontendBuild.sha256');
  assertPositiveInteger(frontendBuild.fileCount, 'frontendBuild.fileCount');
  assertPositiveInteger(frontendBuild.bytes, 'frontendBuild.bytes');
  if (binding && (!completeSource || bindingMatchesSource)) {
    assertSameIdentity(frontendBuild, binding.frontendBuild, 'Frontend build');
    assertSameIdentity(frontendBundle, binding.frontendBundle, 'Frontend bundle');
  }

  return Object.freeze({
    schemaVersion: 2,
    application: Object.freeze({
      id: metadata.id,
      industry: metadata.industry,
      image: metadata.image,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      project: COMPOSE_PROJECT,
      service: COMPOSE_SERVICE,
      stableContainer: STABLE_CONTAINER,
    }),
    source: Object.freeze({ ...source }),
    frontendBuild: Object.freeze({ ...frontendBuild }),
    frontendBundle,
    bindingMode: binding && (!completeSource || bindingMatchesSource)
      ? 'embedded-frozen-source'
      : 'computed-unfrozen-candidate',
  });
}

function setRuntimeIdentityHeaders(res, runtimeIdentity) {
  res.setHeader('X-LiveStack-Id', runtimeIdentity.application.id);
  res.setHeader('X-LiveStack-Image', runtimeIdentity.application.image);
  res.setHeader('X-LiveStack-Source', runtimeIdentity.source.sha256);
  res.setHeader(
    'X-LiveStack-Source-Count',
    String(runtimeIdentity.source.fileCount)
  );
  res.setHeader(
    'X-LiveStack-Source-Bytes',
    String(runtimeIdentity.source.bytes)
  );
  res.setHeader('X-LiveStack-Build', runtimeIdentity.frontendBuild.sha256);
  res.setHeader('X-LiveStack-Bundle', runtimeIdentity.frontendBundle.sha256);
  res.setHeader(
    'X-LiveStack-Bundle-Count',
    String(runtimeIdentity.frontendBundle.fileCount)
  );
}

module.exports = {
  APPLICATION_ID,
  COMPOSE_PROJECT,
  COMPOSE_SERVICE,
  STABLE_CONTAINER,
  RUNTIME_SOURCE_BINDING_RELATIVE_PATH,
  RUNTIME_EXECUTABLE_MANIFEST_RELATIVE_PATH,
  FULL_SOURCE_MARKER_RELATIVE_PATH,
  SOURCE_AGGREGATE_DEFINITION,
  SOURCE_EXCLUSIONS,
  REQUIRED_DISTRIBUTABLE_PATHS,
  computeFrozenSourceIdentity,
  computeRuntimeIdentity,
  hashFileSet,
  loadRuntimeSourceBinding,
  setRuntimeIdentityHeaders,
};
