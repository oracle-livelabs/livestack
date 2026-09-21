function resolveConversationQuestion(question, conversationContext = []) {
  const q = String(question || '').trim();
  const qLower = q.toLowerCase();
  const previousUser = [...(conversationContext || [])]
    .reverse()
    .find((entry) => entry?.role === 'user' && entry.text && entry.text.trim().toLowerCase() !== qLower);
  const previousAssistant = [...(conversationContext || [])]
    .reverse()
    .find((entry) => entry?.role === 'assistant' && entry.text);

  if (!previousUser && !previousAssistant) return q;

  const looksLikeFollowUp =
    q.length < 90 ||
    /\b(it|that|those|them|same|previous|above|break down|breakdown|compare|what about|how about|by property|by guest|by segment|by source|by room|by operations|why)\b/i.test(q);

  if (!looksLikeFollowUp) return q;
  const hasExplicitRefinement =
    /\bby\s+(property|brand|guest|tier|segment|source|category|room|room type|operations|region|channel|status|severity|period)\b/i.test(q) ||
    /\b(break down|breakdown|compare|group|filter|limit|sort)\b/i.test(q);

  return [
    `Current follow-up: ${q}`,
    previousUser ? `Original conversation topic: ${previousUser.text}` : null,
    previousAssistant && !hasExplicitRefinement ? `Previous assistant answer: ${previousAssistant.text}` : null,
    hasExplicitRefinement ? 'Apply the current refinement to the original conversation topic. The current requested dimension takes priority.' : null,
    'Continue from the same Hospitality LiveStack conversation context unless the user explicitly changes topic.',
  ].filter(Boolean).join('\n');
}

module.exports = {
  resolveConversationQuestion,
};
