import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SETUP = ROOT / 'ingestion/db/schema/08_agents.sql'
LOADER = ROOT / 'init/adb-load.sh'


class AgentSqlBootstrapTests(unittest.TestCase):
    def test_definitions_are_complete_and_use_the_configured_profile(self):
        source = SETUP.read_text()
        definitions = {}
        for kind, name, attributes in re.findall(
            r'DBMS_CLOUD_AI_AGENT\.CREATE_(TOOL|AGENT|TASK|TEAM)\('
            r'\s*\w+\s*=>\s*q\'~([^~]+)~\','
            r'\s*attributes\s*=>\s*q\'~([^~]+)~\'', source):
            definitions[(kind, name)] = json.loads(attributes.replace('&&PG_AGENT_PROFILE', 'PG_RETAIL_AGENT_PROFILE'))

        self.assertEqual(len(definitions), 7)
        self.assertEqual({kind for kind, _ in definitions}, {'TOOL', 'AGENT', 'TASK', 'TEAM'})
        self.assertEqual(sum(kind == 'TOOL' for kind, _ in definitions), 2)
        self.assertEqual(sum(kind == 'AGENT' for kind, _ in definitions), 2)
        self.assertEqual(sum(kind == 'TASK' for kind, _ in definitions), 2)
        self.assertEqual(sum(kind == 'TEAM' for kind, _ in definitions), 1)
        for (kind, name), attributes in definitions.items():
            if kind == 'AGENT':
                self.assertEqual(attributes['profile_name'], 'PG_RETAIL_AGENT_PROFILE', name)
                self.assertIs(attributes['enable_human_tool'], False, name)
            elif kind == 'TASK':
                self.assertIs(attributes['enable_human_tool'], False, name)
                for tool in attributes['tools']:
                    self.assertIn(('TOOL', tool), definitions)
                if name == 'STOCK_RESPONSE_TASK':
                    self.assertEqual(attributes['input'], 'DEMAND_SCOUT_TASK')
            elif kind == 'TOOL' and attributes.get('tool_type') == 'SQL':
                self.assertEqual(attributes['tool_params']['profile_name'], 'PG_RETAIL_AGENT_PROFILE', name)
            elif kind == 'TEAM':
                for agent in attributes['agents']:
                    self.assertIn(('AGENT', agent['name']), definitions)
                    self.assertIn(('TASK', agent['task']), definitions)
        self.assertNotIn('PG_COHERE_PROFILE', source)
        self.assertEqual(
            definitions[('TEAM', 'RETAIL_RESPONSE_TEAM')]['agents'],
            [{'name': 'DEMAND_SCOUT_AGENT', 'task': 'DEMAND_SCOUT_TASK'},
             {'name': 'STOCK_PLANNER_AGENT', 'task': 'STOCK_RESPONSE_TASK'}],
        )

    def test_loader_runs_agent_sql_after_functions_and_profile(self):
        loader = LOADER.read_text()
        self.assertLess(loader.index('08_agent_tool_functions.sql'), loader.index('${PROFILE_SQL}\n\nPROMPT Creating Select AI Agent'))
        self.assertLess(loader.index('${PROFILE_SQL}\n\nPROMPT Creating Select AI Agent'), loader.index('08_agents.sql'))
        self.assertIn('DEFINE PG_AGENT_PROFILE = ${OCI_RETAIL_AGENT_PROFILE_NAME}', loader)
        self.assertIn('"xai.grok-4.3"', loader.replace('\\"', '"'))
        self.assertIn('WHENEVER SQLERROR EXIT SQL.SQLCODE', SETUP.read_text())


if __name__ == '__main__':
    unittest.main()
