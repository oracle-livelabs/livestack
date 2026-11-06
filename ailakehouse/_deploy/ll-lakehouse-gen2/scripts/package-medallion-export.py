#!/usr/bin/env python3
"""Normalize sanitized REST/SQLcl exports into portable, credential-free assets."""
import json
from pathlib import Path
import re
import sys

DROP = {'globalId', 'dateCreated', 'dateUpdated', 'firstUser', 'internalId',
        'stepId', 'stepGlobalId', 'internalStep', 'procedureName', 'procedureGlobalId',
        'mappingGlobalId', 'packageGlobalId', 'bulkLoadGlobalId', 'variableId',
        'variableGlobalId', 'projectGlobalId', 'boundToDataStoreId',
        'boundToDataStoreModel', 'schemaGlobalId', 'dataServerGlobalId',
        'dataServerName', 'logicalSchema', 'attachedSchemas'}


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if k not in DROP}
    if isinstance(value, list):
        return [clean(v) for v in value]
    return value


def package(raw, ddl):
    result = {'project': {'name': 'peakgear_medallion', 'code': 'PEAKGEAR_MEDALLION'},
              'mappings': clean(raw['mappings']), 'packages': clean(raw['packages']),
              'variables': clean(raw['variableList']), 'bulkload': []}
    for var in result['variables']:
        var['defaultValue'] = {'v_pg_password': '${PG_PASSWORD}',
                              'v_pg_aicat_catalog_url': '${AI_DATA_CATALOG_URL}'}[var['variableName']]
    for load in raw['bulkload']:
        result['bulkload'].append({k: clean(load[k]) for k in (
            'bulkLoadName', 'bulkLoadMode', 'sourceTechno', 'targetTechno',
            'parentFolder', 'chunkSize', 'dataLoadOptions')})
        result['bulkload'][-1]['sourceTables'] = [
            {k: row[k] for k in ('sourceTableName', 'targetPreloadAction')}
            for row in load['sourceTables']]
    result['databaseObjects'] = []
    for obj in ddl['results'][0]['items']:
        statement = obj['ddl'].strip()
        # GET_DDL on this service adds a KU$ data-copy statement. Ship DDL only.
        if obj['object_type'] == 'TABLE':
            statement = statement.split(';', 1)[0].strip()
        else:
            statement = statement.rstrip(';').replace('CREATE OR REPLACE FORCE EDITIONABLE VIEW', 'CREATE VIEW')
        if obj['object_name'] == 'ailh_enriched_sales_v':
            # Silver Iceberg does not exist until the learner runs workflow 2.
            # Workflow 3 replaces this shape-compatible bootstrap view.
            statement = statement.replace('"silver"."AILH_ENRICHED_SALES"@"PG_AICAT"',
                                          '"PG"."ailh_enriched_sales"')
        result['databaseObjects'].append({'name': obj['object_name'], 'type': obj['object_type'], 'ddl': statement})
    text = json.dumps(result, indent=2) + '\n'
    if re.search(r'[0-9a-f]{8}-[0-9a-f-]{27}|https://|__ENV_|__REDACTED__|adw235337', text, re.I):
        raise ValueError('Export still contains environment-specific references')
    return text


if __name__ == '__main__':
    Path(sys.argv[3]).write_text(package(json.loads(Path(sys.argv[1]).read_text()),
                                      json.loads(Path(sys.argv[2]).read_text())))
