'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// This is an image-payload component digest, not the source trust anchor. The
// exact external full-source manifest identity is embedded into the generated
// frontend build identity and exposed separately as `frozenSource`.
const RUNTIME_PAYLOAD_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  'backend',
  'verification/demo-dataset',
]);

function listFiles(rootDir, relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [relativePath];
  return fs.readdirSync(absolutePath, { withFileTypes: true })
    .flatMap((entry) => {
      const childPath = path.posix.join(relativePath, entry.name);
      if (entry.isDirectory()) return listFiles(rootDir, childPath);
      if (entry.isFile()) return [childPath];
      throw new Error(`Runtime identity rejects special file ${childPath}`);
    });
}

function hashFileSet(rootDir, relativePaths) {
  const files = relativePaths
    .flatMap((relativePath) => listFiles(rootDir, relativePath))
    .sort((left, right) => left.localeCompare(right, 'en'));
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

function computeRuntimeIdentity(rootDir = path.resolve(__dirname, '../..')) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
  );
  const metadata = packageJson.livestack;
  if (!metadata?.id || !metadata?.industry || !metadata?.image
      || !metadata?.composeProject || !metadata?.container
      || !metadata?.databaseImage || !metadata?.databaseContainer
      || !metadata?.schemaGeneration) {
    throw new Error(
      'package.json must define exact LiveStack app/database image, project, '
      + 'container, and schema identity'
    );
  }

  const frontendDist = path.join(rootDir, 'frontend/dist');
  const buildIdentityPath = path.join(frontendDist, 'build-identity.json');
  if (!fs.existsSync(buildIdentityPath)) {
    throw new Error(
      'frontend/dist/build-identity.json is required for exact runtime identity'
    );
  }
  const build = JSON.parse(fs.readFileSync(buildIdentityPath, 'utf8'));
  if (build.schemaVersion !== 1
      || !/^[a-f0-9]{64}$/.test(String(build.sha256 || ''))
      || !Number.isInteger(build.fileCount)
      || !Number.isInteger(build.bytes)
      || build.frozenSource?.schemaVersion !== 1
      || build.frozenSource?.applicationId !== 'livestack-retail'
      || !/^[a-f0-9]{64}$/.test(
        String(build.frozenSource?.manifestSha256 || '')
      )
      || !/^[a-f0-9]{64}$/.test(
        String(build.frozenSource?.databaseSourceSha256 || '')
      )
      || !Number.isInteger(build.frozenSource?.fileCount)
      || !Number.isInteger(build.frozenSource?.sourceBytes)
      || !Number.isInteger(build.frozenSource?.manifestBytes)
      || build.frozenSource?.schemaGeneration
        !== 'retail-schema-2026.07.30.13') {
    throw new Error('frontend build identity is incomplete or malformed');
  }

  return Object.freeze({
    schemaVersion: 1,
    application: Object.freeze({
      id: metadata.id,
      industry: metadata.industry,
      image: metadata.image,
      composeProject: metadata.composeProject,
      container: metadata.container,
      databaseImage: metadata.databaseImage,
      databaseContainer: metadata.databaseContainer,
      schemaGeneration: metadata.schemaGeneration,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
    }),
    frozenSource: Object.freeze(build.frozenSource),
    runtimePayload: Object.freeze(
      hashFileSet(rootDir, RUNTIME_PAYLOAD_PATHS)
    ),
    frontendBuild: Object.freeze(build),
    frontendBundle: Object.freeze(
      hashFileSet(rootDir, ['frontend/dist'])
    ),
  });
}

function setRuntimeIdentityHeaders(res, runtimeIdentity) {
  res.setHeader('X-LiveStack-Id', runtimeIdentity.application.id);
  res.setHeader('X-LiveStack-Image', runtimeIdentity.application.image);
  res.setHeader('X-LiveStack-Project', runtimeIdentity.application.composeProject);
  res.setHeader('X-LiveStack-Container', runtimeIdentity.application.container);
  res.setHeader(
    'X-LiveStack-Database-Image',
    runtimeIdentity.application.databaseImage
  );
  res.setHeader(
    'X-LiveStack-Database-Container',
    runtimeIdentity.application.databaseContainer
  );
  res.setHeader(
    'X-LiveStack-Source',
    runtimeIdentity.frozenSource.manifestSha256
  );
  res.setHeader(
    'X-LiveStack-Source-Count',
    String(runtimeIdentity.frozenSource.fileCount)
  );
  res.setHeader(
    'X-LiveStack-Source-Bytes',
    String(runtimeIdentity.frozenSource.sourceBytes)
  );
  res.setHeader(
    'X-LiveStack-Database-Source',
    runtimeIdentity.frozenSource.databaseSourceSha256
  );
  res.setHeader(
    'X-LiveStack-Schema-Generation',
    runtimeIdentity.frozenSource.schemaGeneration
  );
  res.setHeader('X-LiveStack-Build', runtimeIdentity.frontendBuild.sha256);
  res.setHeader('X-LiveStack-Bundle', runtimeIdentity.frontendBundle.sha256);
}

module.exports = {
  RUNTIME_PAYLOAD_PATHS,
  computeRuntimeIdentity,
  hashFileSet,
  setRuntimeIdentityHeaders,
};
