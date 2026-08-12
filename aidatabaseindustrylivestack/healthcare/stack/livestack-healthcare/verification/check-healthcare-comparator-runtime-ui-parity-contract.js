#!/usr/bin/env node
/*
 * Comparator-backed Healthcare parity contract for:
 * - the Manufacturing story rail and Scene 1-9 presentation pattern;
 * - Oracle Internals collapsed on entry and scene changes;
 * - accepted High Tech Unified Audit ownership/enablement;
 * - accepted High Tech/Manufacturing Spatial candidate and plan behavior.
 *
 * This is source-only. It never awards live DB/API/browser acceptance.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
  } catch (_) {
    return '';
  }
};

const story = read('frontend/src/components/HealthcareStory.jsx');
const welcome = read('frontend/src/pages/Welcome.jsx');
const styles = read('frontend/src/styles/index.css');
const oraclePanel = read('frontend/src/components/RightOraclePanel.jsx');
const fulfillmentPage = read('frontend/src/pages/FulfillmentMap.jsx');
const fulfillment = read('backend/routes/fulfillment.js');
const vectorSchema = read('db/schema/04_vector.sql');
const vectorFinalizer = read('db/data/finalize_vector_search.sql');
const spatialHydration = read('db/data/hydrate_spatial_points.sql');
const spatialZones = read('db/data/seed_fulfillment_zones.sql');
const spatialSchema = read('db/schema/05_spatial.sql');
const auditAdmin = read('db/schema/16_healthcare_unified_audit_admin.sql');
const legacySecurity = read('db/schema/06_security.sql');
const bootstrap = read('scripts/bootstrap_db.sh');
const seed = read('db/data/load_care_pathway_graph.sql');

const checks = [];
function check(name, work) {
  try {
    work();
    checks.push({ name, status: 'PASS' });
  } catch (error) {
    checks.push({ name, status: 'RED', detail: error.message });
  }
}

function assertSpatialBootstrapLifecycle({
  bootstrapSource,
  hydrationSource,
  zoneSource,
  schemaSource,
}) {
  assert.match(
    bootstrapSource,
    /cat > \/tmp\/hydrate\.sql <<SQL\s+WHENEVER OSERROR EXIT FAILURE ROLLBACK\s+WHENEVER SQLERROR EXIT SQL\.SQLCODE ROLLBACK/i
  );
  assert.match(zoneSource, /WHENEVER OSERROR EXIT FAILURE ROLLBACK/i);
  assert.match(zoneSource, /WHENEVER SQLERROR EXIT SQL\.SQLCODE ROLLBACK/i);
  assert.doesNotMatch(hydrationSource, /\bCOMMIT\s*;/i);
  assert.doesNotMatch(zoneSource, /\bCOMMIT\s*;/i);
  assert.doesNotMatch(zoneSource, /\bWHEN OTHERS\b/i);
  assert.doesNotMatch(zoneSource, /\b(?:DROP|CREATE)\s+INDEX\b/i);
  assert.match(
    schemaSource,
    /CREATE INDEX idx_zones_boundary ON fulfillment_zones\s*\(\s*zone_boundary\s*\)[\s\S]*INDEXTYPE IS MDSYS\.SPATIAL_INDEX_V2/i
  );
  assert.match(zoneSource, /v_active_centers\s*=\s*0\s+OR\s+v_valid_centers\s*<>\s*v_active_centers/i);
  assert.match(zoneSource, /v_expected_zones\s*:=\s*v_active_centers\s*\*\s*4/i);
  assert.match(zoneSource, /SDO_GEOM\.VALIDATE_GEOMETRY_WITH_CONTEXT/i);
  assert.match(zoneSource, /SDO_GEOM\.RELATE/i);
  assert.match(zoneSource, /v_valid_zones\s*<>\s*v_expected_zones/i);
  assert.match(zoneSource, /v_complete_zone_centers\s*<>\s*v_active_centers/i);
  assert.match(zoneSource, /v_inactive_zones\s*<>\s*0/i);
}

function assertInitialVectorLifecycle({ bootstrapSource, schemaSource, finalizerSource }) {
  assert.match(
    bootstrapSource,
    /healthcare_security_pkg\.set_actor_context\('admin_jess'\);[\s\S]*@(?:\$\{APP_DIR\}\/)?db\/data\/finalize_vector_search\.sql[\s\S]*healthcare_security_pkg\.clear_actor_context;/i
  );
  assert.match(finalizerSource, /WHENEVER OSERROR EXIT FAILURE ROLLBACK/i);
  assert.match(finalizerSource, /WHENEVER SQLERROR EXIT SQL\.SQLCODE ROLLBACK/i);
  assert.match(finalizerSource, /SAVEPOINT healthcare_vector_rebuild/i);
  assert.match(finalizerSource, /FROM user_mining_models[\s\S]*model_name = 'ALL_MINILM_L12_V2'/i);
  assert.match(finalizerSource, /v_product_vectors\s*=\s*v_source_products/i);
  assert.match(finalizerSource, /v_post_vectors\s*=\s*v_source_posts/i);
  assert.match(finalizerSource, /v_semantic_matches\s*=\s*v_expected_matches/i);
  assert.match(finalizerSource, /REPLACE\(UPPER\(vector_info\), ' ', ''\) = 'VECTOR\(384,FLOAT32,DENSE\)'/i);
  assert.match(
    schemaSource,
    /CREATE TABLE product_embeddings[\s\S]*?embedding\s+VECTOR\(384,\s*FLOAT32\)/i
  );
  assert.match(
    schemaSource,
    /CREATE TABLE post_embeddings[\s\S]*?embedding\s+VECTOR\(384,\s*FLOAT32\)/i
  );
  assert.equal(
    (schemaSource.match(/\bVECTOR\(384,\s*FLOAT32\)/gi) || []).length,
    4
  );
  assert.match(
    bootstrapSource,
    /VECTOR_SCHEMA_READY="\$\([\s\S]*FROM user_tab_columns[\s\S]*'VECTOR\(384,FLOAT32,DENSE\)'[\s\S]*FROM user_tables[\s\S]*'SEMANTIC_MATCHES'[\s\S]*THEN 'yes'[\s\S]*\)"/i
  );
  assert.match(
    bootstrapSource,
    /if \[ "\$VECTOR_SCHEMA_READY" != "yes" \]; then[\s\S]*DROP TABLE ['"]?\s*\|\|[\s\S]*drop_derived_table\('SEMANTIC_MATCHES'\)[\s\S]*drop_derived_table\('POST_EMBEDDINGS'\)[\s\S]*drop_derived_table\('PRODUCT_EMBEDDINGS'\)[\s\S]*@\/tmp\/04_vector_schema\.sql[\s\S]*Retained Vector schema did not converge to 384\/FLOAT32/i
  );
  assert.match(
    bootstrapSource,
    /VECTOR_SCHEMA_READY=[\s\S]*@\/tmp\/04_vector_schema\.sql[\s\S]*@(?:\$\{APP_DIR\}\/)?db\/data\/finalize_vector_search\.sql/i
  );
  assert.match(finalizerSource, /DELETE FROM semantic_matches[\s\S]*DELETE FROM post_embeddings[\s\S]*DELETE FROM product_embeddings/i);
  assert.match(finalizerSource, /INSERT INTO product_embeddings[\s\S]*VECTOR_EMBEDDING\(/i);
  assert.match(finalizerSource, /INSERT INTO post_embeddings[\s\S]*FETCH FIRST 500 ROWS ONLY/i);
  assert.match(finalizerSource, /INSERT INTO semantic_matches[\s\S]*WHERE match_rank <= 3/i);
  assert.match(finalizerSource, /ROLLBACK TO healthcare_vector_rebuild/i);
  assert.doesNotMatch(finalizerSource, /\bCOMMIT\s*;/i);
}

check('Welcome carries one nine-use-case Healthcare story rail', () => {
  assert.equal((story.match(/\bstage:\s*['"][1-9]['"]/g) || []).length, 9);
  assert.match(welcome, /import\s+\{\s*HealthcareStoryRail\s*\}\s+from\s+['"]\.\.\/components\/HealthcareStory['"]/);
  assert.match(welcome, /<HealthcareStoryRail\s*\/>/);
  assert.match(story, /Nine use cases, one sepsis readmission prevention story/i);
  assert.match(welcome, /Key Healthcare Use Cases Featured/);
});

check('Healthcare story is anchored to existing Healthcare seed facts', () => {
  for (const token of [
    /NorthStar Health System/i,
    /CASE-SEPSIS-READMIT/i,
    /48-hour follow-up/i,
    /7-day readmission risk/i,
  ]) {
    assert.match(story, token);
    assert.match(`${seed}\n${read('db/data/load_all_data.sql')}`, token);
  }
  assert.doesNotMatch(story, /AX-400|WO-4501|CircuitForge|PCB Rev C|plant capacity|supplier delay/i);
});

check('Every Healthcare use-case page renders its numbered story scene', () => {
  const pages = {
    DataModel: 'datamodel',
    Dashboard: 'dashboard',
    SocialFeed: 'quality-signals',
    InfluencerGraph: 'graph',
    FulfillmentMap: 'fulfillment',
    Orders: 'service-requests',
    OMLAnalytics: 'oml',
    AskData: 'askdata',
    AgentConsole: 'agents',
  };
  for (const [page, scene] of Object.entries(pages)) {
    const source = read(`frontend/src/pages/${page}.jsx`);
    assert.match(source, /import\s+\{\s*SceneStoryPanel\s*\}\s+from\s+['"]\.\.\/components\/HealthcareStory['"]/);
    assert.match(source, new RegExp(`<SceneStoryPanel\\s+scene=["']${scene}["']\\s*\\/>`));
  }
  assert.equal((story.match(/eyebrow:\s*['"]Scene [1-9]\s*-/g) || []).length, 9);
});

check('Story presentation is responsive and follows the comparator layout', () => {
  assert.match(styles, /\.welcome-story-rail__steps\s*\{[\s\S]*grid-template-columns:\s*repeat\(3/i);
  assert.match(styles, /\.healthcare-story-panel\s*\{[\s\S]*grid-template-columns:/i);
  assert.match(styles, /@media \(max-width:\s*1024px\)[\s\S]*\.healthcare-story-panel\s*\{[\s\S]*grid-template-columns:\s*1fr/i);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*\.welcome-story-rail__steps\s*\{[\s\S]*grid-template-columns:\s*1fr/i);
});

check('Oracle Internals is collapsed initially and resets on every scene title', () => {
  assert.match(oraclePanel, /const\s+\[collapsed,\s*setCollapsed\]\s*=\s*useState\(true\)/);
  assert.match(oraclePanel, /const\s+\{\s*content,\s*title\s*\}\s*=\s*useOraclePanelCtx/);
  assert.match(oraclePanel, /useEffect\(\(\)\s*=>\s*\{\s*setCollapsed\(true\);\s*\},\s*\[title\]\)/);
  assert.match(oraclePanel, /aria-label=\{collapsed\s*\?\s*['"]Show Oracle Internals['"]\s*:\s*['"]Collapse Oracle Internals['"]\}/);
});

check('Unified Audit is ADMIN-owned, exact, enabled, and conflict-checked', () => {
  assert.match(auditAdmin, /CREATE AUDIT POLICY sc_order_audit/i);
  for (const action of [/UPDATE ON .*ORDERS/i, /DELETE ON .*ORDERS/i, /INSERT ON .*AGENT_ACTIONS/i]) {
    assert.match(auditAdmin, action);
  }
  assert.match(auditAdmin, /audit_unified_policies/i);
  assert.match(auditAdmin, /audit_unified_enabled_policies/i);
  assert.match(auditAdmin, /AUDIT POLICY sc_order_audit/i);
  assert.match(auditAdmin, /conflicting definition/i);
});

check('Bootstrap installs Unified Audit as ADMIN and removes broad app privilege', () => {
  assert.match(
    bootstrap,
    /sqlplus -L -s "\$ADMIN_CONNECT"\s+@"\$\{APP_DIR\}\/db\/schema\/16_healthcare_unified_audit_admin\.sql"\s+"\$APP_SCHEMA_USER_UPPER"/i
  );
  assert.doesNotMatch(bootstrap, /GRANT AUDIT_ADMIN TO \$\{APP_SCHEMA_USER_UPPER\}/);
  assert.match(bootstrap, /REVOKE AUDIT_ADMIN FROM \$\{APP_SCHEMA_USER_UPPER\}/);
  assert.doesNotMatch(legacySecurity, /CREATE AUDIT POLICY sc_order_audit/i);
});

check('The surfaced readiness route receives only its narrow catalog read', () => {
  assert.match(
    auditAdmin,
    /GRANT SELECT ON SYS\.AUDIT_UNIFIED_ENABLED_POLICIES TO/i
  );
  assert.doesNotMatch(auditAdmin, /GRANT\s+(?:AUDIT_ADMIN|AUDIT_VIEWER|SELECT_CATALOG_ROLE)/i);
});

check('Spatial nearest uses bounded validated inputs and indexed candidates', () => {
  assert.match(fulfillment, /const SPATIAL_NN_PARAMETERS\s*=\s*['"]sdo_batch_size=50 unit=KM['"]/);
  assert.match(fulfillment, /function boundedResultCount/);
  assert.match(fulfillment, /function finiteCoordinate/);
  assert.match(fulfillment, /WITH origin AS[\s\S]*indexed_candidates AS[\s\S]*SDO_NN[\s\S]*measured_candidates AS/i);
  assert.match(fulfillment, /INDEX\(center idx_fc_spatial\)/i);
  assert.match(fulfillment, /FETCH FIRST :maxResults ROWS ONLY/i);
  assert.doesNotMatch(fulfillment, /'sdo_num_res='\s*\|\|\s*:maxResults/i);
  assert.match(spatialHydration, /UPDATE fulfillment_centers[\s\S]*SET location = SDO_GEOMETRY/i);
  assert.match(spatialHydration, /UPDATE customers[\s\S]*SET location = SDO_GEOMETRY/i);
  assert.match(spatialHydration, /v_hydrated_centers\s*<>\s*v_expected_centers/i);
  assert.match(spatialHydration, /v_hydrated_customers\s*<>\s*v_expected_customers/i);
  assert.match(
    bootstrap,
    /@(?:\$\{APP_DIR\}\/)?db\/data\/hydrate_spatial_points\.sql[\s\S]*@(?:\$\{APP_DIR\}\/)?db\/data\/seed_fulfillment_zones\.sql/i
  );
  assert.match(
    bootstrap,
    /healthcare_security_pkg\.set_actor_context\('admin_jess'\);[\s\S]*@(?:\$\{APP_DIR\}\/)?db\/data\/hydrate_spatial_points\.sql[\s\S]*@(?:\$\{APP_DIR\}\/)?db\/data\/seed_fulfillment_zones\.sql[\s\S]*healthcare_security_pkg\.clear_actor_context;/i
  );
  const lifecycleSources = {
    bootstrapSource: bootstrap,
    hydrationSource: spatialHydration,
    zoneSource: spatialZones,
    schemaSource: spatialSchema,
  };
  assertSpatialBootstrapLifecycle(lifecycleSources);

  const noDriverRollback = bootstrap.replace(
    /(cat > \/tmp\/hydrate\.sql <<SQL\s+WHENEVER OSERROR EXIT FAILURE ROLLBACK\s+)WHENEVER SQLERROR EXIT SQL\.SQLCODE ROLLBACK/i,
    '$1WHENEVER SQLERROR EXIT SQL.SQLCODE'
  );
  assert.notEqual(noDriverRollback, bootstrap);
  assert.throws(() => assertSpatialBootstrapLifecycle({
    ...lifecycleSources,
    bootstrapSource: noDriverRollback,
  }));

  const wrongZoneCardinality = spatialZones.replace(
    /v_expected_zones\s*:=\s*v_active_centers\s*\*\s*4/i,
    'v_expected_zones := v_active_centers'
  );
  assert.notEqual(wrongZoneCardinality, spatialZones);
  assert.throws(() => assertSpatialBootstrapLifecycle({
    ...lifecycleSources,
    zoneSource: wrongZoneCardinality,
  }));

  const missingCompleteCenterProof = spatialZones.replace(
    /v_complete_zone_centers\s*<>\s*v_active_centers/i,
    'v_complete_zone_centers < 0'
  );
  assert.notEqual(missingCompleteCenterProof, spatialZones);
  assert.throws(() => assertSpatialBootstrapLifecycle({
    ...lifecycleSources,
    zoneSource: missingCompleteCenterProof,
  }));
});

check('Spatial readiness proves the real same-session domain-index cursor plan', () => {
  assert.match(fulfillment, /spatial-readiness[\s\S]*db\.withActorConnection\(req\.demoUser/i);
  assert.match(fulfillment, /GATHER_PLAN_STATISTICS/i);
  assert.match(fulfillment, /DBMS_XPLAN\.DISPLAY_CURSOR/i);
  assert.match(fulfillment, /DOMAIN INDEX/i);
  assert.match(fulfillment, /IDX_FC_SPATIAL/i);
  assert.match(fulfillment, /probe_result_count/i);
  assert.match(fulfillmentPage, /api\.fulfillment\.spatialReadiness\(\)/);
  assert.match(fulfillmentPage, /data-spatial-readiness=\{spatialEvidenceStatus\}/);
  assert.match(fulfillmentPage, /spatialEvidence\?\.plan_evidence/);
  assert.match(fulfillmentPage, /DBMS_XPLAN/);
});

check('Fresh bootstrap materializes the accepted comparator Vector dataset', () => {
  const lifecycleSources = {
    bootstrapSource: bootstrap,
    schemaSource: vectorSchema,
    finalizerSource: vectorFinalizer,
  };
  assertInitialVectorLifecycle(lifecycleSources);

  const missingFinalizerCall = bootstrap.replace(
    /@(?:\$\{APP_DIR\}\/)?db\/data\/finalize_vector_search\.sql/i,
    ''
  );
  assert.notEqual(missingFinalizerCall, bootstrap);
  assert.throws(() => assertInitialVectorLifecycle({
    ...lifecycleSources,
    bootstrapSource: missingFinalizerCall,
  }));

  const incompleteVectorCoverage = vectorFinalizer.replace(
    /v_post_vectors\s*=\s*v_source_posts/i,
    'v_post_vectors > 0'
  );
  assert.notEqual(incompleteVectorCoverage, vectorFinalizer);
  assert.throws(() => assertInitialVectorLifecycle({
    ...lifecycleSources,
    finalizerSource: incompleteVectorCoverage,
  }));

  const wildcardVectorSchema = vectorSchema.replace(
    /VECTOR\(384,\s*FLOAT32\)/i,
    'VECTOR(384)'
  );
  assert.notEqual(wildcardVectorSchema, vectorSchema);
  assert.throws(() => assertInitialVectorLifecycle({
    ...lifecycleSources,
    schemaSource: wildcardVectorSchema,
  }));

  const wildcardRetainedDetection = bootstrap.replace(
    /'VECTOR\(384,FLOAT32,DENSE\)'/i,
    "'VECTOR(384,*,DENSE)'"
  );
  assert.notEqual(wildcardRetainedDetection, bootstrap);
  assert.throws(() => assertInitialVectorLifecycle({
    ...lifecycleSources,
    bootstrapSource: wildcardRetainedDetection,
  }));
});

for (const result of checks) {
  process.stdout.write(`${result.status} ${result.name}`);
  if (result.detail) process.stdout.write(`\n  ${result.detail}`);
  process.stdout.write('\n');
}

const passed = checks.filter(({ status }) => status === 'PASS').length;
const failed = checks.length - passed;
process.stdout.write(`\nHealthcare comparator runtime/UI parity source contract: ${passed}/${checks.length} PASS, ${failed} RED\n`);
if (failed) process.exitCode = 1;
