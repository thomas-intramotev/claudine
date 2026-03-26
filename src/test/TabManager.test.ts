/**
 * Tests for TabManager — focus on BUG14 / BUG14b race conditions.
 *
 * BUG14:  replaceRestoredTab race allows infinite tab open/close loops.
 * BUG14b: Same race causes frantic focus-switching between Claude Code views.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { TabManager } from '../providers/TabManager';

// ── helpers ──────────────────────────────────────────────────────────

/** Build a fake tab that matches the Claude Code provider pattern. */
function makeClaudeTab(label: string): vscode.Tab {
  return {
    label,
    input: new vscode.TabInputWebview('claude-code-editor'),
    isActive: true,
    isDirty: false,
    isPinned: false,
    isPreview: false,
    group: {} as vscode.TabGroup,
  };
}

function createMockStateManager() {
  return {
    getConversations: vi.fn().mockReturnValue([]),
    getConversation: vi.fn(),
    setConversations: vi.fn(),
    updateConversation: vi.fn(),
    moveConversation: vi.fn(),
    removeConversation: vi.fn(),
    setConversationIcon: vi.fn(),
    clearAllIcons: vi.fn().mockResolvedValue(undefined),
    loadDrafts: vi.fn().mockResolvedValue([]),
    saveDrafts: vi.fn().mockResolvedValue(undefined),
    archiveStaleConversations: vi.fn(),
    archiveAllDone: vi.fn(),
    getConversationsByStatus: vi.fn().mockReturnValue([]),
    onConversationsChanged: () => ({ dispose: () => {} }),
    onNeedsInput: () => ({ dispose: () => {} }),
    ready: Promise.resolve(),
    getRateLimitedConversations: vi.fn().mockReturnValue([]),
    flushSave: vi.fn(),
  };
}

/**
 * Create a TabManager with mocked VS Code tab enumeration.
 * Uses injected isProviderTab to bypass instanceof checks in the mock.
 */
function createTabManager(opts: {
  tabs?: vscode.Tab[];
  activeTab?: vscode.Tab | null;
  conversations?: Array<{ id: string; title: string; status: string }>;
}) {
  const stateManager = createMockStateManager();
  if (opts.conversations) {
    stateManager.getConversations.mockReturnValue(opts.conversations);
  }

  const allTabs = opts.tabs ?? [];
  const activeTab = opts.activeTab ?? (allTabs.length > 0 ? allTabs[0] : null);

  const closeFn = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(vscode.window, 'tabGroups', {
    value: {
      all: [{
        isActive: true,
        activeTab,
        tabs: allTabs,
        viewColumn: 1,
      }],
      close: closeFn,
      onDidChangeTabs: () => ({ dispose: () => {} }),
    },
    configurable: true,
    writable: true,
  });

  const isProviderTab = (tab: vscode.Tab): boolean => {
    const input = tab.input as { viewType?: string };
    return !!input && typeof input.viewType === 'string' &&
      /claude/i.test(input.viewType) && !/claudine/i.test(input.viewType);
  };
  const isProviderTerminal = (terminal: vscode.Terminal): boolean => {
    return /claude/i.test(terminal.name) && !/claudine/i.test(terminal.name);
  };

  const tabManager = new TabManager(stateManager as never, isProviderTab, isProviderTerminal);

  return { tabManager, stateManager, closeFn };
}

// ── tests ────────────────────────────────────────────────────────────

describe('TabManager — BUG14 replaceRestoredTab race condition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not re-enter replaceRestoredTab while a replacement is pending', async () => {
    const tab = makeClaudeTab('Fix auth bug');
    const conversations = [{ id: 'conv-1', title: 'Fix auth bug', status: 'in-progress' }];
    const { tabManager } = createTabManager({
      tabs: [tab],
      activeTab: tab,
      conversations,
    });

    const openCalls: string[] = [];
    tabManager.onOpenConversation = (id) => { openCalls.push(id); };

    // First detection triggers replaceRestoredTab (async — flush with advanceTimersAsync)
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1);
    expect(openCalls[0]).toBe('conv-1');

    // Second detection while replacement guard is still held:
    // _replacingStaleTab is true → no second replacement
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1); // BUG14: was 2 before fix
  });

  it('resets replacement guard after recordActiveTabMapping is called', async () => {
    const tab = makeClaudeTab('Fix auth bug');
    const conversations = [{ id: 'conv-1', title: 'Fix auth bug', status: 'in-progress' }];
    const { tabManager } = createTabManager({
      tabs: [tab],
      activeTab: tab,
      conversations,
    });

    const openCalls: string[] = [];
    tabManager.onOpenConversation = (id) => { openCalls.push(id); };

    // First replacement triggers
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1);

    // Simulate the tab mapping being recorded
    tabManager.recordActiveTabMapping('conv-1');

    // Detection should NOT re-trigger replacement because mapping now exists
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1);
  });

  it('does NOT re-trigger replacement even after safety timeout (BUG14c)', async () => {
    const tab = makeClaudeTab('Fix auth bug');
    const conversations = [{ id: 'conv-1', title: 'Fix auth bug', status: 'in-progress' }];
    const { tabManager } = createTabManager({
      tabs: [tab],
      activeTab: tab,
      conversations,
    });

    const openCalls: string[] = [];
    tabManager.onOpenConversation = (id) => { openCalls.push(id); };

    // First detection triggers replacement
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1);

    // Still guarded before timeout
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1);

    // Advance past the safety timeout (3000ms) + suppression window
    await vi.advanceTimersByTimeAsync(5000);

    // BUG14c: After the first replacement, _restoredTabReplacementDone is true
    // so even with all guards cleared, it should NOT trigger again.
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(1); // BUG14c: was 2 before fix
  });
});

describe('TabManager — BUG14c user-opened tabs are not treated as restored shells', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not replace a tab the user opens after initial detection', async () => {
    // Initial detection with no Claude tabs present
    const { tabManager } = createTabManager({
      tabs: [],
      activeTab: null,
      conversations: [{ id: 'conv-1', title: 'Fix auth bug', status: 'in-progress' }],
    });

    const openCalls: string[] = [];
    tabManager.onOpenConversation = (id) => { openCalls.push(id); };

    // First detection pass — no tabs found, marks replacement as done
    tabManager.detectFocusedConversation();

    // User opens a new Claude Code tab (via Claude Code's own button)
    const newTab = makeClaudeTab('Fix auth bug');
    Object.defineProperty(vscode.window, 'tabGroups', {
      value: {
        all: [{
          isActive: true,
          activeTab: newTab,
          tabs: [newTab],
          viewColumn: 1,
        }],
        close: vi.fn().mockResolvedValue(undefined),
        onDidChangeTabs: () => ({ dispose: () => {} }),
      },
      configurable: true,
      writable: true,
    });

    // Detection fires from onDidChangeTabs — should NOT replaceRestoredTab
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    expect(openCalls).toHaveLength(0); // BUG14c: would have been 1 before fix
  });
});

describe('TabManager — BUG24 matchTabToConversation excludes Codex conversations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT match a Claude Code tab to a Codex conversation by title', async () => {
    const claudeTab = makeClaudeTab('Fix auth bug');
    const conversations = [
      { id: 'codex-abc123', title: 'Fix auth bug', status: 'in-progress', provider: 'codex' },
    ];
    const { tabManager } = createTabManager({
      tabs: [claudeTab],
      activeTab: claudeTab,
      conversations,
    });

    // First call marks _restoredTabReplacementDone = true (tab is unmapped + empty map)
    tabManager.onOpenConversation = () => {};
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);

    // Now record a mapping so the restored-tab path is fully clear
    tabManager.recordActiveTabMapping('codex-abc123');

    const focusChanges: Array<string | null> = [];
    tabManager.onFocusChanged = (id) => { focusChanges.push(id); };

    // Remove the mapping to simulate a clean state (but _restoredTabReplacementDone is true)
    tabManager.removeMapping('codex-abc123');

    // detectFocusedConversation should NOT match the Claude tab to the Codex conversation
    tabManager.detectFocusedConversation();

    // Should report null (no match), not the Codex conversation ID
    expect(focusChanges).toHaveLength(1);
    expect(focusChanges[0]).toBeNull();
  });

  it('matches a Claude Code tab to a Claude Code conversation with the same title', async () => {
    const claudeTab = makeClaudeTab('Fix auth bug');
    const conversations = [
      { id: 'codex-abc123', title: 'Fix auth bug', status: 'in-progress', provider: 'codex' },
      { id: 'claude-conv-1', title: 'Fix auth bug', status: 'in-progress', provider: 'claude-code' },
    ];
    const { tabManager } = createTabManager({
      tabs: [claudeTab],
      activeTab: claudeTab,
      conversations,
    });

    // First call marks _restoredTabReplacementDone = true
    tabManager.onOpenConversation = () => {};
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);
    tabManager.recordActiveTabMapping('claude-conv-1');

    const focusChanges: Array<string | null> = [];
    tabManager.onFocusChanged = (id) => { focusChanges.push(id); };

    tabManager.detectFocusedConversation();

    // Should match the Claude Code conversation, NOT the Codex one
    expect(focusChanges).toHaveLength(1);
    expect(focusChanges[0]).toBe('claude-conv-1');
  });

  it('fuzzy title match also excludes Codex conversations', async () => {
    // Use a different tab label so exact match doesn't fire
    const claudeTab = makeClaudeTab('Fix auth');
    const conversations = [
      { id: 'codex-abc123', title: 'Fix auth bug in login flow', status: 'in-progress', provider: 'codex' },
    ];
    const { tabManager } = createTabManager({
      tabs: [claudeTab],
      activeTab: claudeTab,
      conversations,
    });

    // First call: marks _restoredTabReplacementDone, but since there's a fuzzy match
    // to the codex conversation, it might try to replace. Provide a no-op handler.
    tabManager.onOpenConversation = () => {};
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);

    // Map the tab so the restored-tab path doesn't interfere
    tabManager.recordActiveTabMapping('temp-id');
    tabManager.removeMapping('temp-id');

    const focusChanges: Array<string | null> = [];
    tabManager.onFocusChanged = (id) => { focusChanges.push(id); };

    tabManager.detectFocusedConversation();

    // Should NOT fuzzy-match to the Codex conversation
    expect(focusChanges).toHaveLength(1);
    expect(focusChanges[0]).toBeNull();
  });
});

describe('TabManager — BUG14b focus suppression on replacement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('suppresses focus detection during tab replacement', async () => {
    const tab = makeClaudeTab('Fix auth bug');
    const conversations = [{ id: 'conv-1', title: 'Fix auth bug', status: 'in-progress' }];
    const { tabManager } = createTabManager({
      tabs: [tab],
      activeTab: tab,
      conversations,
    });

    tabManager.onOpenConversation = () => {};

    // Trigger replacement — calls suppressFocus internally
    tabManager.detectFocusedConversation();
    await vi.advanceTimersByTimeAsync(0);

    // scheduleFocusDetection should be suppressed during the replacement window
    const focusChanges: Array<string | null> = [];
    tabManager.onFocusChanged = (id) => { focusChanges.push(id); };

    tabManager.scheduleFocusDetection();
    await vi.advanceTimersByTimeAsync(200); // past the normal debounce
    expect(focusChanges).toHaveLength(0); // suppressed
  });
});
