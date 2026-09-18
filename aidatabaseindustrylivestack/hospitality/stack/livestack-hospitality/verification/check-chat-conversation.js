const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { resolveConversationQuestion } = require('../backend/lib/conversationContext');

const projectRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

const history = [
  { role: 'user', text: 'Which properties have the highest room revenue?' },
  { role: 'assistant', text: 'Grand Harbor Hotel leads, followed by Summit Resort.' },
];

const resolved = resolveConversationQuestion('Break that down by room type.', history);
assert.match(resolved, /Current follow-up: Break that down by room type\./);
assert.match(resolved, /Original conversation topic: Which properties have the highest room revenue\?/);
assert.doesNotMatch(resolved, /Previous assistant answer:/);
assert.match(resolved, /current requested dimension takes priority/);
assert.match(resolved, /same Hospitality LiveStack conversation context/);

const referential = resolveConversationQuestion('Why is that?', history);
assert.match(referential, /Original conversation topic:/);
assert.match(referential, /Previous assistant answer: Grand Harbor Hotel leads/);

const unrelated = resolveConversationQuestion(
  'Create a complete independent analysis of housekeeping capacity across every region for the next thirty days, including the governing source fields and calculation assumptions.',
  history,
);
assert.equal(unrelated.startsWith('Current follow-up:'), false, 'an explicit new topic should not be forced into old context');

const askDataPath = path.join(projectRoot, 'frontend/src/pages/AskData.jsx');
if (fs.existsSync(askDataPath)) {
  const askDataSource = read('frontend/src/pages/AskData.jsx');
  assert.match(askDataSource, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(askDataSource, /window\.localStorage\.setItem\(storageKey/);
  assert.match(askDataSource, /api\.selectai\.showsql\(question, profile, buildConversationHistory\(messages\)\)/);
  assert.match(askDataSource, /api\.selectai\.runsql\(question, profile, buildConversationHistory\(messages\)\)/);
  assert.match(askDataSource, /\.slice\(-12\)/);

  const agentSource = read('frontend/src/pages/AgentConsole.jsx');
  assert.match(agentSource, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(agentSource, /window\.localStorage\.setItem\(storageKey/);
  assert.match(agentSource, /api\.agents\.chat\(question, buildAgentConversationHistory\(messages\), activeProfile\)/);
  assert.match(agentSource, /\.slice\(-12\)/);
}

const selectAiRoute = read('backend/routes/selectai.js');
assert.match(selectAiRoute, /resolveConversationQuestion\(q, conversationContext\)/);
assert.match(selectAiRoute, /contextTurns: conversationContext\.length/);

console.log('Ask Hospitality Data and Agent Console conversation verification passed.');
