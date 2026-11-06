const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/database');
const selectAiService = require('../lib/selectAiService');
const selectAiObjects = require('../../db/schema/select_ai_objects.json');

test('Select AI accepts an accessible DBMS_CLOUD synonym for a versioned package', async () => {
  const originalGetConnection = db.getConnection;
  const restrictedObjects = selectAiObjects.map((name) => ({ owner: 'PG', name }));
  let objectList = restrictedObjects;
  let reconciled = false;
  const config = {
    ORACLE_USER: 'PG',
    OCI_REGION: 'us-ashburn-1',
    OCI_COMPARTMENT_ID: 'compartment',
    OCI_USER_OCID: 'user',
    OCI_TENANCY_OCID: 'tenancy',
    OCI_FINGERPRINT: 'fingerprint',
    OCI_PRIVATE_KEY: 'private-key',
  };
  const previous = Object.fromEntries(Object.keys(config).map((key) => [key, process.env[key]]));
  Object.assign(process.env, config);
  db.getConnection = async () => ({
    async execute(sql, binds) {
      if (sql.includes('FROM all_objects') && sql.includes('DBMS_CLOUD_AI')) {
        const objects = [{ OBJECT_NAME: 'DBMS_CLOUD_AI' }];
        if (sql.includes('FROM all_synonyms')) objects.push({ OBJECT_NAME: 'DBMS_CLOUD' });
        return { rows: objects };
      }
      if (sql.includes('FROM user_cloud_ai_profiles')) {
        return { rows: [{ PROFILE_NAME: 'PG_GENAI_PROFILE', STATUS: 'ENABLED' }] };
      }
      if (sql.includes('FROM user_cloud_ai_profile_attributes')) {
        return { rows: [
          { ATTRIBUTE_NAME: 'model', ATTRIBUTE_VALUE: 'cohere.command-a-03-2025' },
          { ATTRIBUTE_NAME: 'embedding_model', ATTRIBUTE_VALUE: 'cohere.embed-v4.0' },
          { ATTRIBUTE_NAME: 'region', ATTRIBUTE_VALUE: 'us-ashburn-1' },
          { ATTRIBUTE_NAME: 'object_list', ATTRIBUTE_VALUE: JSON.stringify(objectList) },
        ] };
      }
      if (sql.includes('DBMS_CLOUD.CREATE_CREDENTIAL')) return {};
      if (sql.includes('DBMS_CLOUD_AI.CREATE_PROFILE')) {
        objectList = JSON.parse(binds.profileAttributes).object_list;
        reconciled = true;
        return {};
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async close() {},
  });

  try {
    const status = await selectAiService.fetchRuntimeStatus({ force: true });
    assert.equal(status.available, true);
    assert.equal(status.runtime, 'select_ai');
    assert.equal(reconciled, false);

    objectList = [{ owner: 'PG' }];
    const repaired = await selectAiService.fetchRuntimeStatus({ force: true });
    assert.equal(repaired.available, true);
    assert.equal(reconciled, true);
    assert.deepEqual(objectList, restrictedObjects);
  } finally {
    db.getConnection = originalGetConnection;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
