import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'init'))
spec = importlib.util.spec_from_file_location('medallion', ROOT / 'init/provision-medallion.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
BUNDLE = json.loads((ROOT / 'init/data-transforms/peakgear-medallion.json').read_text())
SCHEMA = {'globalId': 'fresh-schema', 'dataSchema': 'PG', 'logicalSchema': 'fresh-logical'}
ORACLE = {'globalId': 'fresh-server', 'name': 'new-adw', 'schemas': [SCHEMA]}
CATALOG = {'globalId': 'fresh-catalog', 'name': 'pg-aicat', 'schemas': [
    {'globalId': 'fresh-silver', 'dataSchema': 'silver'}]}


class FakeApi:
    base = 'https://test.invalid'
    def __init__(self):
        self.project = None
        self.writes = []
        self.items = {k: [] for k in ('variables', 'mappings', 'bulkload', 'packages')}
        self.items['mappings'].append({'name': 'untouched', 'projectName': 'peakgear', 'globalId': 'original'})
        self.items['datastores'] = [dict(name=n, globalId='new-' + n, modelCode='NEW_MODEL',
                                       schemaName='PG', schemaGlobalId='fresh-schema',
                                       dataServerName='new-adw', dataServerGlobalId='fresh-server')
                                    for n in m.required_stores(BUNDLE)]

    def request(self, method, path, payload=None, missing=False):
        if method == 'GET':
            if path.startswith('/projects/name/'):
                return self.project
            if path.startswith('/bulkload/id/'):
                return next(x for x in self.items['bulkload'] if x['globalId'] == path.rsplit('/', 1)[-1])
            return copy.deepcopy(self.items[path.lstrip('/')])
        if method != 'POST':
            raise AssertionError('Non-additive operation: ' + method)
        self.writes.append((path, copy.deepcopy(payload)))
        result = dict(payload, globalId='created-' + str(len(self.writes)))
        if path == '/projects':
            self.project = result
        else:
            if path == '/bulkload':
                result['deploymentStatus'] = 'VALID'
            self.items[path.lstrip('/')].append(result)
        return result


class Tests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        env = patch.dict(os.environ, {'DATA_TRANSFORMS_IMPORT_STATE_DIR': tmp.name})
        env.start()
        self.addCleanup(env.stop)

    def test_missing_store_uses_resumable_import(self):
        api = FakeApi()
        store = api.items['datastores'].pop()
        api.items['models'] = [{'modelCode': 'PEAKGEAR_MEDALLION_PG', 'schema': SCHEMA}]
        def imported(client, payload, resume_only=False):
            if resume_only:
                return
            self.assertIs(client, api)
            self.assertEqual(payload['reverseObjList'], "'" + store['name'] + "'")
            api.items['datastores'].append(store)
        with patch.object(m, 'import_model', side_effect=imported) as wait:
            result = m.ensure_stores(api, BUNDLE, ORACLE, SCHEMA, 'test-agent')
        self.assertEqual(wait.call_count, 2)
        self.assertIn(store['name'], result)

    def test_one_import_discovers_all_entities_without_redundant_jobs(self):
        api = FakeApi()
        stores = api.items['datastores']
        api.items['datastores'] = []
        api.items['models'] = [{'modelCode': 'PEAKGEAR_MEDALLION_PG', 'schema': SCHEMA}]
        def imported(client, payload, resume_only=False):
            if not resume_only:
                api.items['datastores'] = stores
        with patch.object(m, 'import_model', side_effect=imported) as wait:
            result = m.ensure_stores(api, BUNDLE, ORACLE, SCHEMA, 'test-agent')
        self.assertEqual(wait.call_count, 2)  # resume check, then exactly one new import
        self.assertEqual(set(result), m.required_stores(BUNDLE))

    def test_visible_entities_still_wait_for_outstanding_import(self):
        api = FakeApi()
        with patch.object(m, 'import_model', side_effect=RuntimeError('still running')):
            with self.assertRaisesRegex(RuntimeError, 'still running'):
                m.ensure_stores(api, BUNDLE, ORACLE, SCHEMA, 'test-agent')
        self.assertEqual(api.writes, [])

    def test_complete_manifest_and_portability(self):
        self.assertEqual([len(BUNDLE[k]) for k in ('mappings', 'bulkload', 'packages', 'variables', 'databaseObjects')],
                         [3, 1, 4, 2, 8])
        text = json.dumps(BUNDLE)
        self.assertNotRegex(text, r'https://|adw235337|[0-9a-f]{8}-[0-9a-f-]{27}|__ENV_|__REDACTED__')
        self.assertEqual({v['defaultValue'] for v in BUNDLE['variables']},
                         {'${PG_PASSWORD}', '${AI_DATA_CATALOG_URL}'})

    def test_create_then_noop_preserves_peakgear(self):
        api = FakeApi()
        original = copy.deepcopy(api.items['mappings'][0])
        with patch.dict(os.environ, {'DBPASSWORD': 'test-only', 'AI_DATA_CATALOG_URL': 'https://example.test/catalog'}), patch.object(m, 'ensure_silver_namespace'):
            m.provision(api, BUNDLE, ORACLE, CATALOG, 'test-agent')
            self.assertEqual(len(api.writes), 11)  # project, 2 variables, 3 flows, load, 4 workflows
            api.writes.clear()
            m.provision(api, BUNDLE, ORACLE, CATALOG, 'test-agent')
        self.assertEqual(api.writes, [])
        self.assertEqual(api.items['mappings'][0], original)

    def test_mapping_binding_and_expressions_preserved(self):
        stores = {x['name']: x for x in FakeApi().items['datastores']}
        for flow in BUNDLE['mappings']:
            bound = m.bind_mapping(flow, stores)
            for section in ('joins', 'expressions', 'filters', 'aggregations', 'dbfunc_datacleanses'):
                # Generated identifiers may be added, but expression strings must not change.
                if section in flow:
                    for before, after in zip(flow[section], bound[section]):
                        self.assertEqual(before.get('name'), after.get('name'))
            for c in bound['sources'] + bound['targets']:
                self.assertEqual(c['dataServerGlobalId'], 'fresh-server')
                self.assertEqual(c['boundToDataStoreModel'], 'NEW_MODEL')

    def test_database_bootstrap_is_create_missing_only(self):
        sql = m.database_sql(BUNDLE)
        self.assertEqual(sql.count('IF n = 0 THEN'), 8)
        self.assertNotRegex(sql, r'(?i)\b(drop|truncate|insert|delete)\b|CREATE OR REPLACE|KU\$')
        silver = next(o for o in BUNDLE['databaseObjects'] if o['name'] == 'ailh_enriched_sales_v')
        self.assertIn('FROM "PG"."ailh_enriched_sales"', silver['ddl'])
        self.assertIn('"silver"."AILH_ENRICHED_SALES"',
                      next(p for p in BUNDLE['packages'] if p['name'] == 'wf_03_silver_to_gold')['sqlSteps'][0]['sqlText'])

    def test_workflow_dependency_ids_rebound(self):
        package = next(p for p in BUNDLE['packages'] if p['name'] == 'wf_medallion_architecture')
        objects = {s['packageName']: {'globalId': 'fresh-' + s['packageName']} for s in package['packageSteps']}
        bound = m.bind_package(package, objects, ORACLE, SCHEMA)
        self.assertTrue(all(s['packageGlobalId'].startswith('fresh-') for s in bound['packageSteps']))
        self.assertTrue(all('internalStep' not in s for s in bound['packageSteps']))

    def test_service_and_image_integration(self):
        service = (ROOT / 'init/pg-medallion-project.service').read_text()
        self.assertIn('pg-iceberg-connection.service pg-ai-catalog-bronze.service', service)
        self.assertIn('pg-medallion-project.service', (ROOT / 'inst.sh').read_text())
        self.assertIn('PG_MEDALLION_PROJECT_SERVICE', (ROOT / 'prepare-custom-image.sh').read_text())
        self.assertIn('aicat_connection_is_available', (ROOT / 'init/create-medallion-project.sh').read_text())

    def test_empty_project_lookup_and_partial_retry(self):
        api = FakeApi()
        api.project = {}
        with patch.dict(os.environ, {'DBPASSWORD': 'test-only', 'AI_DATA_CATALOG_URL': 'https://example.test/catalog'}), patch.object(m, 'ensure_silver_namespace'):
            m.provision(api, BUNDLE, ORACLE, CATALOG, 'test-agent')
            api.items['packages'] = [p for p in api.items['packages'] if p['name'] != 'wf_medallion_architecture']
            api.writes.clear()
            m.provision(api, BUNDLE, ORACLE, CATALOG, 'test-agent')
        self.assertEqual(len(api.writes), 1)
        self.assertEqual(api.writes[0][0], '/packages')

    def test_invalid_load_is_not_reported_as_success(self):
        api = FakeApi()
        with patch.dict(os.environ, {'DBPASSWORD': 'test-only', 'AI_DATA_CATALOG_URL': 'https://example.test/catalog'}), patch.object(m, 'ensure_silver_namespace'):
            m.provision(api, BUNDLE, ORACLE, CATALOG, 'test-agent')
            api.items['bulkload'][0]['deploymentStatus'] = 'INVALID'
            api.writes.clear()
            with self.assertRaises(m.ProvisionError):
                m.provision(api, BUNDLE, ORACLE, CATALOG, 'test-agent')
        self.assertEqual(api.writes, [])


if __name__ == '__main__':
    unittest.main()
