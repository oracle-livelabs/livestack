"""Offline regression checks for additive AI Catalog access provisioning."""
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'init/configure-ai-catalog-access.py'
spec = importlib.util.spec_from_file_location('access', path)
access = importlib.util.module_from_spec(spec)
spec.loader.exec_module(access)


class FakeClient:
    def __init__(self):
        self.exists = False
        self.members = []
        self.grants = {}
        self.writes = []

    def request(self, method, path, payload=None):
        if method == 'POST':
            self.writes.append((path, payload))
            if path.endswith('/groups'):
                self.exists = True
            elif path.endswith('/principals:add'):
                self.members.extend(payload['principals'])
            else:
                self.grants.setdefault(path, set()).update(p['privilegeName'] for p in payload['privileges'])
            return {}
        if '/grants/' in path:
            return {'items': [{'principalType': 'GROUP', 'principalName': access.GROUP,
                              'privileges': [{'privilegeName': p} for p in self.grants.get(path, set())]}]}
        if not self.exists:
            raise access.ApiError(404, path)
        # Actual API omits members on the group-details route.
        return {'principals': self.members if path.endswith('/principals') else []}


class AccessTests(unittest.TestCase):
    def test_create_and_repeat_without_writes(self):
        client = FakeClient()
        access.reconcile(client, 'PG')
        self.assertEqual(len(client.writes), 4)
        client.writes.clear()
        access.reconcile(client, 'PG')
        self.assertEqual(client.writes, [])

    def test_additive_grants_preserve_existing(self):
        client = FakeClient()
        client.exists = True
        client.members = [{'principalType': 'USER', 'principalName': 'OTHER'}]
        endpoint = '/v1/auth/grants/metalake/default'
        client.grants[endpoint] = {'USE_METALAKE', 'OTHER_EXISTING_PRIVILEGE'}
        access.reconcile(client, 'PG')
        payload = next(p for route, p in client.writes if route == endpoint)
        self.assertEqual(payload['privileges'], [{'privilegeName': 'BROWSE_METALAKE'}])
        self.assertIn('OTHER_EXISTING_PRIVILEGE', client.grants[endpoint])
        self.assertEqual(client.members[0]['principalName'], 'OTHER')

    def test_other_groups_do_not_supply_rights(self):
        self.assertEqual(access.privileges_for_group({'items': [{
            'principalType': 'GROUP', 'principalName': 'OTHER',
            'privileges': [{'privilegeName': 'USE_METALAKE'}]}]}), set())

    def test_disabled_or_missing_url_needs_no_credentials(self):
        for env in ({}, {'AI_DATA_CATALOG_ENABLED': 'true'}):
            with patch.dict(os.environ, env, clear=True), patch.object(access, 'Client') as client:
                self.assertEqual(access.main(), 0)
                client.assert_not_called()

    def test_no_administrator_or_drop_grants(self):
        self.assertFalse(any('ADMIN' in p or 'DROP' in p for ps in access.GRANTS.values() for p in ps))


if __name__ == '__main__':
    unittest.main()
