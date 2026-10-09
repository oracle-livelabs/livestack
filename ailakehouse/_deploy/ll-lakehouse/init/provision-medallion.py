#!/usr/bin/env python3
"""Add the medallion project without resetting existing Data Transforms objects."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

from data_transform_import import import_model


class ProvisionError(RuntimeError):
    pass


class Api:
    def __init__(self):
        self.base = os.environ['DT_BASE_URL'].rstrip('/')
        self.prefix = os.environ.get('DATA_TRANSFORMS_API_PREFIX', '/odi/odi-rest/v1')

    def request(self, method, path, payload=None, missing=False):
        command = ['curl', '-sS', '--config', os.environ['CURL_AUTH_CONFIG'],
                   '-b', os.environ['COOKIE_JAR'], '-c', os.environ['COOKIE_JAR'],
                   '--connect-timeout', '20', '--max-time', '120', '-X', method,
                   '-H', 'Accept: application/json', '-w', '\n%{http_code}']
        if payload is not None:
            command += ['-H', 'Content-Type: application/json', '--data-binary', '@-']
        command.append(self.base + self.prefix + path)
        result = subprocess.run(command, input=json.dumps(payload) if payload is not None else None,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
        body, _, status = result.stdout.rpartition('\n')
        if missing and status == '404':
            return None
        if result.returncode or not status.startswith('2'):
            raise ProvisionError(f'{method} {path}: HTTP {status or "unavailable"}')
        return json.loads(body) if body.strip() else {}


def log(message):
    print('[medallion] ' + message, flush=True)


def project_template(bundle, name):
    text = json.dumps(bundle).replace('PEAKGEAR_MEDALLION', name.upper()).replace('peakgear_medallion', name)
    return json.loads(text)


def database_sql(bundle):
    statements = ['SET ECHO OFF DEFINE OFF FEEDBACK OFF',
                  'WHENEVER SQLERROR EXIT FAILURE ROLLBACK',
                  'WHENEVER OSERROR EXIT FAILURE ROLLBACK']
    for obj in bundle['databaseObjects']:
        name, kind, ddl = obj['name'], obj['type'], obj['ddl']
        if "'" in name or "~'" in ddl or kind not in ('TABLE', 'VIEW'):
            raise ProvisionError('Invalid packaged database object')
        statements.append(f"""DECLARE n NUMBER; t VARCHAR2(128);
BEGIN
 SELECT COUNT(*), MAX(object_type) INTO n,t FROM user_objects
 WHERE object_name = '{name}' AND object_type IN ('TABLE','VIEW');
 IF n = 0 THEN EXECUTE IMMEDIATE q'~{ddl}~';
 ELSIF t <> '{kind}' THEN RAISE_APPLICATION_ERROR(-20001,'Medallion object type mismatch');
 END IF;
END;
/""")
    return '\n'.join(statements)


def setup_database(bundle):
    password = (os.environ.get('ADB_STREAM_SCHEMA_PASSWORD') or os.environ['DBPASSWORD']).replace('"', '""')
    service = os.environ['SERVICE_NAME']
    if not service.replace('_', '').isalnum():
        raise ProvisionError('Invalid database service name')
    script = ('SET ECHO OFF DEFINE OFF\nWHENEVER SQLERROR EXIT FAILURE ROLLBACK\n'
              f'CONNECT PG/"{password}"@"{service}"\n' + database_sql(bundle) + '\nEXIT\n')
    result = subprocess.run(['sql', '-s', '/nolog'], input=script, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, universal_newlines=True, timeout=300)
    if result.returncode:
        raise ProvisionError('PG medallion database setup failed; existing objects were not replaced')
    log('PG database prerequisites checked (existing objects preserved).')


def identifier(obj):
    value = obj.get('globalId') or obj.get('variableGlobalId')
    if not value:
        raise ProvisionError('API response missing object ID')
    return value


def connection_schema(connection, name):
    return next((s for s in connection.get('schemas', []) if s.get('dataSchema') == name), None)


def ensure_silver_schema(api, connection):
    schema = connection_schema(connection, 'silver')
    if schema:
        return schema
    cid = identifier(connection)
    return api.request('POST', f'/dataservers/id/{cid}/schemas', {
        'schemaShortName': 'silver', 'parentServer': connection['name'],
        'parentServerGlobalId': cid, 'schemaName': connection['name'] + '.silver',
        'dataSchema': 'silver', 'workSchema': 'silver',
        'logicalSchema': f'ADP_S{cid}_PSILVER_LS', 'logicalSchemaTag': 'IMPORTED_SCHEMA',
        'technology': 'APACHE_ICEBERG', 'default': True})


def ensure_silver_namespace():
    # The Data Transforms schema is metadata, not the Iceberg namespace itself.
    path = Path(__file__).parent / 'configure-ai-catalog-access.py'
    spec = importlib.util.spec_from_file_location('catalog_access', path)
    access = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(access)
    client = access.Client(os.environ['AI_DATA_CATALOG_URL'].rstrip('/'))
    client.login('PG', os.environ.get('ADB_STREAM_SCHEMA_PASSWORD') or os.environ['DBPASSWORD'])
    try:
        client.request('GET', '/v1/namespaces/silver')
    except access.ApiError as error:
        if error.status != 404:
            raise ProvisionError('Cannot inspect the silver catalog namespace') from None
        client.request('POST', '/v1/namespaces', {'namespace': ['silver']})
        log('Created silver catalog namespace.')


def required_stores(bundle):
    return {c['boundToDataStoreName'] for flow in bundle['mappings']
            for group in ('sources', 'targets') for c in flow[group]}


def ensure_stores(api, bundle, oracle, schema, agent):
    needed = required_stores(bundle)
    cid = identifier(oracle)

    def read():
        return {s['name']: s for s in api.request('GET', '/datastores')
                if s.get('dataServerGlobalId') == cid and s.get('schemaName') == 'PG'
                and s.get('name') in needed}

    model_code = 'PEAKGEAR_MEDALLION_PG'
    # Finish an outstanding import before using metadata that may be visible early.
    try:
        import_model(api, {'modelCode': model_code}, resume_only=True)
    except RuntimeError as error:
        raise ProvisionError(str(error)) from error
    stores = read()
    if needed <= stores.keys():
        return stores
    models = api.request('GET', '/models')
    model = next((m for m in models if m.get('modelCode') == model_code), None)
    if model is not None and model.get('schema', {}).get('globalId') != schema['globalId']:
        raise ProvisionError('Existing medallion model belongs to another schema')
    if model is None:
        model = api.request('POST', '/models', {
            'modelName': model_code, 'modelCode': model_code, 'parentFolder': 'DefaultFolder',
            'technologyCode': 'ORACLE', 'schema': schema})
    for name in sorted(needed - stores.keys()):
        # A reverse job may discover more than its requested entity.
        if name in read():
            continue
        log('Importing metadata for ' + name)
        payload = copy.deepcopy(model)
        payload.update(reverseType='CUSTOMIZED', reverseAgent=agent, reverseContext='GLOBAL',
                       reverseMask='%', reverseObjectTypes=['TABLE', 'VIEW'], reverseObjList="'" + name + "'")
        try:
            import_model(api, payload)
            log('Metadata import completed for ' + name)
        except RuntimeError as error:
            raise ProvisionError(str(error)) from error
    stores = read()
    if not needed <= stores.keys():
        raise ProvisionError('Required PG data entities are missing after import')
    return stores


def bind_mapping(flow, stores):
    payload = copy.deepcopy(flow)
    for group in ('sources', 'targets'):
        for component in payload[group]:
            store = stores[component['boundToDataStoreName']]
            component.update(boundToDataStoreId=store['globalId'], boundToDataStoreModel=store['modelCode'],
                             schemaGlobalId=store['schemaGlobalId'], schemaName=store['schemaName'],
                             dataServerName=store['dataServerName'], dataServerGlobalId=store['dataServerGlobalId'])
    payload['attachedSchemas'] = sorted({stores[c['boundToDataStoreName']]['schemaGlobalId'] for c in payload['sources']})

    def ids(value):
        if isinstance(value, dict):
            if 'attributes' in value or ('position' in value and 'dataType' in value):
                value['globalId'] = str(uuid.uuid4())
            for child in list(value.values()):
                ids(child)
        elif isinstance(value, list):
            for child in value:
                ids(child)
    ids(payload)
    return payload


def load_payload(load, project, source, target):
    payload = copy.deepcopy(load)
    payload.update(parentProjectID=identifier(project), parentProjectName=project['name'])
    for key, schema, technology in (('sourceModel', source, 'ORACLE'), ('targetModel', target, 'APACHE_ICEBERG')):
        payload[key] = {'technologyCode': technology, 'schema': schema, 'reverseType': 'CUSTOMIZED',
                        'reverseAgent': 'Internal', 'reverseContext': 'GLOBAL', 'reverseMask': '%',
                        'reverseObjectTypes': ['TABLE', 'VIEW'] if key == 'sourceModel' else ['TABLE']}
    return payload


def bind_package(package, objects, oracle, schema):
    payload = copy.deepcopy(package)
    for field, reference, id_key in (('mappingSteps', 'mappingName', 'mappingGlobalId'),
                                     ('bulkLoadSteps', 'bulkLoadName', 'bulkLoadGlobalId'),
                                     ('packageSteps', 'packageName', 'packageGlobalId')):
        for step in payload.get(field, []):
            step[id_key] = identifier(objects[step[reference]])
    for step in payload.get('sqlSteps', []):
        step.update(dataServerGlobalId=identifier(oracle), dataServerName=oracle['name'],
                    schema='PG', logicalSchema=schema['logicalSchema'])
    return payload


def provision(api, bundle, oracle, catalog, agent):
    name = bundle['project']['name']
    project = api.request('GET', '/projects/name/' + name, missing=True)
    if not project:
        project = api.request('POST', '/projects', bundle['project'])
    source = connection_schema(oracle, 'PG')
    if source is None:
        raise ProvisionError('PG connection schema unavailable')
    variables = api.request('GET', '/variables')
    for var in bundle['variables']:
        if any(v.get('projectName') == name and v.get('variableName') == var['variableName'] for v in variables):
            continue
        payload = copy.deepcopy(var)
        payload['projectGlobalId'] = identifier(project)
        payload['defaultValue'] = (os.environ.get('ADB_STREAM_SCHEMA_PASSWORD') or os.environ['DBPASSWORD']) \
            if var['variableName'] == 'v_pg_password' else os.environ['AI_DATA_CATALOG_URL'].rstrip('/')
        api.request('POST', '/variables', payload)
    stores = ensure_stores(api, bundle, oracle, source, agent)
    objects = {}
    for collection, name_key, project_key in (('mappings', 'name', 'projectName'),
                                             ('bulkload', 'bulkLoadName', 'parentProjectName'),
                                             ('packages', 'name', 'projectName')):
        for obj in api.request('GET', '/' + collection):
            if obj.get(project_key) == name:
                objects[obj[name_key]] = obj
    for flow in bundle['mappings']:
        if flow['name'] not in objects:
            objects[flow['name']] = api.request('POST', '/mappings', bind_mapping(flow, stores))
            log('Created flow ' + flow['name'])
    for load in bundle['bulkload']:
        if load['bulkLoadName'] not in objects:
            ensure_silver_namespace()
            target = ensure_silver_schema(api, catalog)
            created = api.request('POST', '/bulkload', load_payload(load, project, source, target))
            if created.get('deploymentStatus') != 'VALID':
                raise ProvisionError('Medallion data load was created but is not valid')
            objects[load['bulkLoadName']] = created
            log('Created data load ' + load['bulkLoadName'])
        detail = api.request('GET', '/bulkload/id/' + identifier(objects[load['bulkLoadName']]))
        if detail.get('deploymentStatus') != 'VALID':
            raise ProvisionError('Existing medallion data load is not valid; preserved for inspection')
    pending = [p for p in bundle['packages'] if p['name'] not in objects]
    while pending:
        ready = [p for p in pending if all(s['packageName'] in objects for s in p.get('packageSteps', []))]
        if not ready:
            raise ProvisionError('Unresolved workflow dependencies')
        for package in ready:
            objects[package['name']] = api.request('POST', '/packages', bind_package(package, objects, oracle, source))
            pending.remove(package)
            log('Created workflow ' + package['name'])
    # Confirm names in this project, not similarly named objects elsewhere.
    for resource, field, parent in (('mappings', 'name', 'projectName'),
                                     ('bulkload', 'bulkLoadName', 'parentProjectName'),
                                     ('packages', 'name', 'projectName')):
        expected = {x[field] for x in bundle[resource]}
        actual = {x[field] for x in api.request('GET', '/' + resource) if x.get(parent) == name}
        if not expected <= actual:
            raise ProvisionError('Project verification failed: ' + resource)
    log(name + ': verified 3 flows, 1 data load and 4 workflows; no workflows executed.')


def main():
    bundle = json.loads((Path(__file__).parent / 'data-transforms/peakgear-medallion.json').read_text())
    name = os.environ.get('DATA_TRANSFORMS_MEDALLION_PROJECT_NAME', 'peakgear_medallion')
    if not name.replace('_', '').isalnum() or name.lower() == 'peakgear':
        raise ProvisionError('Unsafe medallion project name')
    bundle = project_template(bundle, name)
    setup_database(bundle)
    api = Api()
    oracle = api.request('GET', '/dataservers/id/' + os.environ['MEDALLION_ADB_ID'])
    catalog = api.request('GET', '/dataservers/id/' + os.environ['MEDALLION_AICAT_ID'])
    provision(api, bundle, oracle, catalog, os.environ['MEDALLION_AGENT'])


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never echo response bodies, variable payloads or SQL containing secrets.
        print('[medallion] ERROR: ' + (str(error) if isinstance(error, ProvisionError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
