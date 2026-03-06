/**
 * Sample JSONL data for testing ConversationParser.
 * Each fixture represents a different conversation state.
 */

const ts = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

/** Helper: build a single JSONL line */
function line(entry: Record<string, unknown>): string {
  return JSON.stringify(entry);
}

/** Minimal user message entry */
export function userMessage(text: string, minutesAgo = 10, extra: Record<string, unknown> = {}): string {
  return line({
    type: 'user',
    uuid: crypto.randomUUID(),
    timestamp: ts(minutesAgo),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
    ...extra,
  });
}

/** Minimal assistant message entry */
export function assistantMessage(text: string, minutesAgo = 9, toolUses: Array<{ name: string; input?: Record<string, unknown> }> = []): string {
  const content: Array<Record<string, unknown>> = [];
  if (text) {
    content.push({ type: 'text', text });
  }
  for (const tool of toolUses) {
    content.push({ type: 'tool_use', name: tool.name, input: tool.input || {} });
  }
  return line({
    type: 'assistant',
    uuid: crypto.randomUUID(),
    timestamp: ts(minutesAgo),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: {
      role: 'assistant',
      content,
    },
  });
}

/** A simple completed conversation */
export const completedConversation = [
  userMessage('Fix the login bug in auth.ts', 30),
  assistantMessage("I've fixed the login bug. All done!", 28),
].join('\n');

/** A conversation needing user input (question) */
export const needsInputConversation = [
  userMessage('Add dark mode support', 20),
  assistantMessage('Would you like me to use CSS variables or a theme provider?', 18),
].join('\n');

/** A conversation with AskUserQuestion tool use */
export const askUserQuestionConversation = [
  userMessage('Refactor the database layer', 15),
  assistantMessage('', 13, [{ name: 'AskUserQuestion', input: { question: 'Which ORM?' } }]),
].join('\n');

/** A conversation that is still in progress (last message from user) */
export const inProgressConversation = [
  userMessage('Create a new REST API endpoint', 10),
  assistantMessage('I\'ll create the endpoint now.', 9),
  userMessage('Use Express instead of Fastify', 5),
].join('\n');

/** A conversation with an error */
export const errorConversation = [
  userMessage('Deploy to production', 20),
  assistantMessage('Deploying now...', 18, [{ name: 'Bash' }]),
  line({
    type: 'user',
    uuid: crypto.randomUUID(),
    timestamp: ts(17),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', content: 'API Error: 500 Internal Server Error' }],
    },
  }),
].join('\n');

/** A todo conversation (only user message, no assistant) */
export const todoConversation = [
  userMessage('Write unit tests for the parser', 60),
].join('\n');

/** A conversation with git branch info */
export const gitBranchConversation = [
  userMessage('Implement feature X', 30, { gitBranch: 'feature/dark-mode' }),
  assistantMessage('Done implementing feature X. All changes are complete.', 28),
].join('\n');

/** A conversation with sub-agents */
export const subAgentConversation = [
  userMessage('Build a complete auth system', 30),
  assistantMessage('Let me explore the codebase first.', 28, [
    { name: 'Task', input: { subagent_type: 'Explore', description: 'Explore auth patterns' } },
  ]),
  assistantMessage('Now let me plan the implementation.', 25, [
    { name: 'Task', input: { subagent_type: 'Plan', description: 'Plan auth system' } },
  ]),
  assistantMessage("I've completed the auth system. All done!", 20),
].join('\n');

/** A recently active conversation (timestamps within 2 minutes) */
export const recentlyActiveConversation = [
  userMessage('Help me debug this', 1.5),
  assistantMessage('Let me check the logs.', 0.5, [{ name: 'Bash' }]),
].join('\n');

/** A conversation with markup tags that should be stripped from title */
export const markupConversation = [
  userMessage('<ide_opened_file>src/main.ts</ide_opened_file>Fix the typo in the header', 30),
  assistantMessage("I've fixed the typo.", 28),
].join('\n');

/** Empty / malformed content */
export const emptyContent = '';
export const malformedContent = 'not json at all\n{invalid json too';
export const onlyMetadataContent = line({
  type: 'file-history-snapshot',
  uuid: crypto.randomUUID(),
  timestamp: ts(10),
  sessionId: 'test-session',
  parentUuid: null,
  isSidechain: false,
  snapshot: {},
});

/** A large conversation with many messages for stress testing */
export function largeParsableConversation(messageCount = 500): string {
  const lines: string[] = [];
  for (let i = 0; i < messageCount; i++) {
    const minutesAgo = messageCount - i;
    if (i % 2 === 0) {
      lines.push(userMessage(
        i === 0 ? 'Build the authentication system' : `Follow-up message ${i}`,
        minutesAgo
      ));
    } else {
      const tools = i % 10 === 1
        ? [{ name: 'Task', input: { subagent_type: 'Explore', description: `Explore step ${i}` } }]
        : i % 10 === 3
          ? [{ name: 'Bash', input: { command: `echo step-${i}` } }]
          : [];
      lines.push(assistantMessage(
        i === messageCount - 1
          ? "I've completed the authentication system. All done!"
          : `Working on step ${i}...`,
        minutesAgo,
        tools
      ));
    }
  }
  return lines.join('\n');
}

/** A conversation with tool_use blocks containing large inputs */
export const largeToolInputConversation = [
  userMessage('Refactor the entire codebase', 30),
  assistantMessage('', 28, [
    {
      name: 'Edit',
      input: {
        file_path: '/src/very/long/path/to/file.ts',
        old_string: 'x'.repeat(500),
        new_string: 'y'.repeat(500),
      },
    },
    {
      name: 'Write',
      input: {
        file_path: '/src/another/file.ts',
        content: 'z'.repeat(1000),
      },
    },
  ]),
  assistantMessage("I've completed the refactoring. All done!", 25),
].join('\n');

/** An interrupted conversation */
export const interruptedConversation = [
  userMessage('Run the test suite', 20),
  line({
    type: 'assistant',
    uuid: crypto.randomUUID(),
    timestamp: ts(18),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Running tests...' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }],
    },
    toolUseResult: { interrupted: true },
  }),
].join('\n');

// ── BUG reproduction fixtures ────────────────────────────────────────

/** BUG1 — Sidechain-only conversation: all messages are isSidechain=true.
 *  Should be filtered out, not shown as a ghost "Untitled Conversation". */
export const sidechainOnlyConversation = [
  line({
    type: 'user',
    uuid: crypto.randomUUID(),
    timestamp: ts(20),
    sessionId: 'test-session',
    parentUuid: 'some-parent',
    isSidechain: true,
    message: { role: 'user', content: [{ type: 'text', text: 'sidechain user msg' }] },
  }),
  line({
    type: 'assistant',
    uuid: crypto.randomUUID(),
    timestamp: ts(19),
    sessionId: 'test-session',
    parentUuid: 'some-parent',
    isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'text', text: 'sidechain assistant msg' }] },
  }),
].join('\n');

/** BUG1 — Mixed sidechain: real conversation with sidechain entries mixed in.
 *  Title/description should come from non-sidechain messages only. */
export const mixedSidechainConversation = [
  userMessage('Implement the login page', 30),
  line({
    type: 'assistant',
    uuid: crypto.randomUUID(),
    timestamp: ts(28),
    sessionId: 'test-session',
    parentUuid: 'some-parent',
    isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'text', text: 'Sidechain noise that should not appear' }] },
  }),
  assistantMessage("I've implemented the login page. All done!", 25),
].join('\n');

/** BUG3 — Empty conversation: only system-reminder content that gets stripped,
 *  leaving no meaningful title, description, or lastMessage. */
export const emptyMeaninglessConversation = [
  line({
    type: 'user',
    uuid: crypto.randomUUID(),
    timestamp: ts(10),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: { role: 'user', content: [{ type: 'text', text: '<system-reminder>hook output</system-reminder>' }] },
  }),
  line({
    type: 'assistant',
    uuid: crypto.randomUUID(),
    timestamp: ts(9),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
  }),
].join('\n');

/** BUG3 — Conversation with only assistant tool-use, no user text at all. */
export const noUserTextConversation = [
  line({
    type: 'assistant',
    uuid: crypto.randomUUID(),
    timestamp: ts(10),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
  }),
].join('\n');

// ── Sidechain activity fixtures ──────────────────────────────────────

/** Conversation with sidechain activity — assistant tool_use (running),
 *  user tool_result success (completed), user tool_result error (failed). */
export const sidechainActivityConversation = [
  userMessage('Build the auth system', 30),
  // Sidechain: assistant dispatches Bash → running
  line({
    type: 'assistant',
    uuid: crypto.randomUUID(),
    timestamp: ts(28),
    sessionId: 'test-session',
    parentUuid: 'sc-parent',
    isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] },
  }),
  // Sidechain: tool result success → completed
  line({
    type: 'user',
    uuid: crypto.randomUUID(),
    timestamp: ts(27),
    sessionId: 'test-session',
    parentUuid: 'sc-parent',
    isSidechain: true,
    message: { role: 'user', content: [{ type: 'tool_result', content: 'Tests passed', tool_use_id: 'tu1' }] },
  }),
  // Sidechain: tool result error → failed
  line({
    type: 'user',
    uuid: crypto.randomUUID(),
    timestamp: ts(26),
    sessionId: 'test-session',
    parentUuid: 'sc-parent',
    isSidechain: true,
    message: { role: 'user', content: [{ type: 'tool_result', content: 'Error: Exit code 1', tool_use_id: 'tu2', is_error: true }] },
  }),
  assistantMessage("I've completed the auth system. All done!", 20),
].join('\n');

// ── Rate limit fixtures ──────────────────────────────────────────────

/** Conversation where Claude Code hit a rate limit. */
export const rateLimitConversation = [
  userMessage('Implement the search feature', 30),
  assistantMessage('Working on the search feature...', 28, [{ name: 'Bash' }]),
  assistantMessage("You've hit your limit \u00b7 resets 10am (Europe/Zurich)", 27),
].join('\n');

/** Conversation where rate limit message is in a tool_result. */
export const rateLimitToolResultConversation = [
  userMessage('Fix the tests', 20),
  assistantMessage('Running tests...', 18, [{ name: 'Bash' }]),
  line({
    type: 'user',
    uuid: crypto.randomUUID(),
    timestamp: ts(17),
    sessionId: 'test-session',
    parentUuid: null,
    isSidechain: false,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', content: "You've hit your limit \u00b7 resets 2:30pm (America/New_York)" }],
    },
  }),
].join('\n');

/** Rate limit in older messages but resolved by new activity — should NOT be flagged. */
export const rateLimitResolvedConversation = [
  userMessage('Build the API', 60),
  assistantMessage("You've hit your limit \u00b7 resets 10am (Europe/Zurich)", 55),
  userMessage('continue', 30),
  assistantMessage("I've built the API. All done!", 28),
].join('\n');

/** BUG7 — Stale rate limit from an old conversation (>24h ago) — should NOT be flagged. */
export const rateLimitStaleConversation = [
  userMessage('Implement the search feature', 1500),  // ~25 hours ago
  assistantMessage('Working on the search feature...', 1498, [{ name: 'Bash' }]),
  assistantMessage("You've hit your limit \u00b7 resets 10am (Europe/Zurich)", 1497),
].join('\n');

// ── BUG5 — False "needs input" while agent is working ────────────────

/** BUG5 — Recently active conversation where Claude dispatched a tool (e.g. Read)
 *  and the tool result hasn't been written yet. Should be in-progress, NOT needs-input. */
export const activeToolExecutingConversation = [
  userMessage('Help me debug this', 1.5),
  assistantMessage('Let me check the logs.', 0.5, [{ name: 'Read', input: { file_path: '/src/main.ts' } }]),
].join('\n');

/** BUG5 — Recently active conversation with Task (sub-agent) dispatched.
 *  Should be in-progress, NOT needs-input. */
export const activeSubAgentConversation = [
  userMessage('Explore the codebase', 1.5),
  assistantMessage('Let me explore.', 0.5, [
    { name: 'Task', input: { subagent_type: 'Explore', description: 'Explore codebase' } },
  ]),
].join('\n');

/** BUG5 — Recently active conversation with Bash tool dispatched.
 *  Should be in-progress, NOT needs-input. */
export const activeBashConversation = [
  userMessage('Run the tests', 1.5),
  assistantMessage('Running tests now.', 0.5, [{ name: 'Bash', input: { command: 'npm test' } }]),
].join('\n');

/** BUG5 — Recently active conversation with TodoWrite dispatched.
 *  Should be in-progress, NOT needs-input. */
export const activeTodoWriteConversation = [
  userMessage('Plan the implementation', 1.5),
  assistantMessage('Let me create a plan.', 0.5, [{ name: 'TodoWrite' }]),
].join('\n');

/** BUG5b — Assistant says "I should implement..." — "should i" in "should implement"
 *  must NOT trigger the needs-input question regex. */
export const shouldImplementConversation = [
  userMessage('Add dark mode', 20),
  assistantMessage('I should implement this using CSS variables. Let me start working on it.', 18),
].join('\n');

/** BUG5b — Assistant mentions "would you like" mid-conversation but user already responded.
 *  Since the conversation continued past the question, it should NOT be needs-input. */
export const answeredQuestionConversation = [
  userMessage('Add dark mode', 30),
  assistantMessage('Would you like me to use CSS variables or a theme provider?', 28),
  userMessage('CSS variables please', 25),
  assistantMessage('Great, working on it now.', 23, [{ name: 'Edit' }]),
].join('\n');

/** Conversation with more than 3 sidechain entries — only last 3 should be kept. */
export const manySidechainStepsConversation = [
  userMessage('Large task', 30),
  // 5 sidechain entries — only last 3 should survive
  ...Array.from({ length: 5 }, (_, i) => line({
    type: 'assistant',
    uuid: crypto.randomUUID(),
    timestamp: ts(28 - i),
    sessionId: 'test-session',
    parentUuid: 'sc-parent',
    isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: `Tool${i}`, input: {} }] },
  })),
  assistantMessage('All done!', 20),
].join('\n');

/** Conversation where last assistant text ends with a question mark (no tool use). */
export const textEndingWithQuestionConversation = [
  userMessage('Add a caching layer', 20),
  assistantMessage('Should I use Redis or an in-memory cache for this?', 18),
].join('\n');

/** Conversation where assistant text has a question mid-conversation but ends with a statement. */
export const textQuestionAnsweredConversation = [
  userMessage('Add a caching layer', 20),
  assistantMessage('Should I use Redis or an in-memory cache?', 18),
  userMessage('Use Redis', 16),
  assistantMessage('Done! I\'ve added Redis caching.', 14),
].join('\n');

// ── BUG9: Multi-line markup tag stripping ──────────────────────────────

/** User message is entirely a multi-line XML block — should be treated as metadata-only. */
export const multiLineMarkupOnlyConversation = [
  userMessage('<permissions instructions>\n\nSource: https://www.boat24.ch/chen/service/temperaturen/\nIf you meant **Lake Zurich, Illinois**, say so and I\'ll look...\n\n</permissions>', 10),
  assistantMessage('▸ I see the permissions context.', 9),
].join('\n');

/** User message has real text after multi-line markup tags. */
export const multiLineMarkupWithRealTextConversation = [
  userMessage('<system-reminder>\nSessionStart:startup hook success: Success\n</system-reminder>\nFix the login page', 10),
  assistantMessage('▸ I\'ll fix the login page now.', 9),
].join('\n');

/** Assistant description contains markup tags that should be stripped. */
export const markupInDescriptionConversation = [
  userMessage('Refactor the API', 10),
  assistantMessage('<system-reminder>hook output</system-reminder>▸ I\'ll refactor the API endpoints.', 9),
].join('\n');

/** Assistant last message contains markup tags that should be stripped. */
export const markupInLastMessageConversation = [
  userMessage('Add dark mode', 10),
  assistantMessage('Starting work...', 9),
  assistantMessage('<system-reminder>hook output</system-reminder>Done! Dark mode is now available.', 8),
].join('\n');

// ── BUG18: Multi-agent sidechain tracking ──────────────────────────────

/** BUG18 — Multiple distinct background agents running. Each agent has a different
 *  parentUuid chain. Should show one dot per agent (5 agents → 5 dots). */
export const multiAgentSidechainConversation = [
  userMessage('Implement the full feature', 30),
  // Main thread dispatches 5 Task tool uses
  assistantMessage('I\'ll dispatch 5 agents to work on this.', 28, [
    { name: 'Task', input: { subagent_type: 'Explore', description: 'Explore codebase' } },
    { name: 'Task', input: { subagent_type: 'Plan', description: 'Create plan' } },
    { name: 'Task', input: { subagent_type: 'general-purpose', description: 'Research API' } },
    { name: 'Task', input: { subagent_type: 'code-reviewer', description: 'Review code' } },
    { name: 'Task', input: { subagent_type: 'test-runner', description: 'Run tests' } },
  ]),
  // Agent 1 (parentUuid chain: agent-1-root → agent-1-a → agent-1-b)
  line({
    type: 'assistant', uuid: 'agent-1-a', timestamp: ts(27), sessionId: 'test-session',
    parentUuid: 'agent-1-root', isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Grep', input: {} }] },
  }),
  line({
    type: 'user', uuid: 'agent-1-b', timestamp: ts(26), sessionId: 'test-session',
    parentUuid: 'agent-1-a', isSidechain: true,
    message: { role: 'user', content: [{ type: 'tool_result', content: 'Found 3 matches' }] },
  }),
  // Agent 2 (parentUuid chain: agent-2-root → agent-2-a)
  line({
    type: 'assistant', uuid: 'agent-2-a', timestamp: ts(26), sessionId: 'test-session',
    parentUuid: 'agent-2-root', isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: {} }] },
  }),
  // Agent 3 (parentUuid chain: agent-3-root → agent-3-a → agent-3-b)
  line({
    type: 'assistant', uuid: 'agent-3-a', timestamp: ts(25), sessionId: 'test-session',
    parentUuid: 'agent-3-root', isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
  }),
  line({
    type: 'user', uuid: 'agent-3-b', timestamp: ts(24), sessionId: 'test-session',
    parentUuid: 'agent-3-a', isSidechain: true,
    message: { role: 'user', content: [{ type: 'tool_result', content: 'Error: Exit code 1', is_error: true }] },
  }),
  // Agent 4 (parentUuid chain: agent-4-root → agent-4-a)
  line({
    type: 'assistant', uuid: 'agent-4-a', timestamp: ts(23), sessionId: 'test-session',
    parentUuid: 'agent-4-root', isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: {} }] },
  }),
  // Agent 5 (parentUuid chain: agent-5-root → agent-5-a → agent-5-b)
  line({
    type: 'assistant', uuid: 'agent-5-a', timestamp: ts(22), sessionId: 'test-session',
    parentUuid: 'agent-5-root', isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Write', input: {} }] },
  }),
  line({
    type: 'user', uuid: 'agent-5-b', timestamp: ts(21), sessionId: 'test-session',
    parentUuid: 'agent-5-a', isSidechain: true,
    message: { role: 'user', content: [{ type: 'tool_result', content: 'File written successfully' }] },
  }),
  assistantMessage("I've completed the implementation. All done!", 20),
].join('\n');

/** BUG18 — Main thread says "completed" but agents are still running (last sidechain
 *  step has status 'running'). Should be in-progress, NOT in-review. */
export const completedWithRunningAgentsConversation = [
  userMessage('Build the auth system', 30),
  assistantMessage('Dispatching agents to work on this.', 28, [
    { name: 'Task', input: { subagent_type: 'Explore', description: 'Explore codebase' } },
    { name: 'Task', input: { subagent_type: 'Plan', description: 'Create plan' } },
  ]),
  // Agent 1: completed
  line({
    type: 'assistant', uuid: 'bg-1-a', timestamp: ts(27), sessionId: 'test-session',
    parentUuid: 'bg-1-root', isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: {} }] },
  }),
  line({
    type: 'user', uuid: 'bg-1-b', timestamp: ts(26), sessionId: 'test-session',
    parentUuid: 'bg-1-a', isSidechain: true,
    message: { role: 'user', content: [{ type: 'tool_result', content: 'File contents...' }] },
  }),
  // Agent 2: still running (dispatched tool_use, no result yet)
  line({
    type: 'assistant', uuid: 'bg-2-a', timestamp: ts(25), sessionId: 'test-session',
    parentUuid: 'bg-2-root', isSidechain: true,
    message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
  }),
  // Main thread says "completed" despite agent 2 still running
  assistantMessage("I've finished setting up the auth system. All done!", 20),
].join('\n');
