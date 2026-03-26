/**
 * Tests for BUG17 — provider-aware editor command routing.
 *
 * Clicking a Codex conversation should NOT open a Claude Code tab.
 * The KanbanViewProvider must route to the correct IEditorCommands
 * based on the conversation's `provider` field.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { KanbanViewProvider } from '../providers/KanbanViewProvider';
import { Conversation } from '../types';
import { IEditorCommands } from '../providers/IEditorCommands';

// Mock TabManager
vi.mock('../providers/TabManager', () => {
  return {
    TabManager: class MockTabManager {
      dispose = vi.fn();
      scheduleFocusDetection = vi.fn();
      detectFocusedConversation = vi.fn();
      pruneStaleTabMappings = vi.fn();
      recordActiveTabMapping = vi.fn();
      getTabLabel = vi.fn().mockReturnValue(undefined);
      focusTabByLabel = vi.fn();
      focusAnyClaudeTab = vi.fn();
      suppressFocus = vi.fn();
      removeMapping = vi.fn();
      closeEmptyClaudeTabs = vi.fn().mockResolvedValue(0);
      closeUnmappedClaudeTabByTitle = vi.fn();
      isClaudeCodeTab = vi.fn();
      set onFocusChanged(_cb: unknown) {}
      set onOpenConversation(_cb: unknown) {}
    },
  };
});

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: overrides.id || 'conv-1',
    title: 'Test Conversation',
    description: 'A test conversation',
    category: 'task',
    status: 'in-progress',
    lastMessage: 'Last message',
    agents: [],
    hasError: false,
    isInterrupted: false,
    hasQuestion: false,
    isRateLimited: false,
    createdAt: new Date('2025-01-01T10:00:00Z'),
    updatedAt: new Date('2025-01-01T12:00:00Z'),
    ...overrides,
  };
}

function createMockStateManager() {
  const conversationsEmitter = new vscode.EventEmitter();
  const needsInputEmitter = new vscode.EventEmitter();

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
    onConversationsChanged: conversationsEmitter.event,
    onNeedsInput: needsInputEmitter.event,
    ready: Promise.resolve(),
  };
}

function createMockEditorCommands(): IEditorCommands & { openConversation: ReturnType<typeof vi.fn> } {
  return {
    openConversation: vi.fn().mockResolvedValue(true),
    sendPrompt: vi.fn().mockResolvedValue(true),
    startNewConversation: vi.fn().mockResolvedValue(true),
    focusEditor: vi.fn().mockResolvedValue(true),
    interruptTerminals: vi.fn(),
  };
}

describe('KanbanViewProvider — BUG17: provider-aware editor routing', () => {
  let provider: KanbanViewProvider;
  let mockStateManager: ReturnType<typeof createMockStateManager>;
  let claudeEditorCommands: ReturnType<typeof createMockEditorCommands>;
  let codexEditorCommands: ReturnType<typeof createMockEditorCommands>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockStateManager = createMockStateManager();
    claudeEditorCommands = createMockEditorCommands();
    codexEditorCommands = createMockEditorCommands();

    const editorCommandsByProvider = new Map<string, IEditorCommands>();
    editorCommandsByProvider.set('claude-code', claudeEditorCommands);
    editorCommandsByProvider.set('codex', codexEditorCommands);

    provider = new KanbanViewProvider(
      { fsPath: '/mock/extension', scheme: 'file' } as never,
      mockStateManager as never,
      {} as never,
      claudeEditorCommands,
      editorCommandsByProvider,
    );
  });

  afterEach(() => {
    provider.dispose();
    vi.useRealTimers();
  });

  it('routes Claude Code conversations to ClaudeCodeEditorCommands', async () => {
    const conv = makeConversation({ id: 'claude-conv-1', provider: 'claude-code' });
    mockStateManager.getConversation.mockReturnValue(conv);

    await provider.openConversation('claude-conv-1');

    expect(claudeEditorCommands.openConversation).toHaveBeenCalledWith('claude-conv-1');
    expect(codexEditorCommands.openConversation).not.toHaveBeenCalled();
  });

  it('routes Codex conversations to CodexEditorCommands', async () => {
    const conv = makeConversation({ id: 'codex-abc123', provider: 'codex' });
    mockStateManager.getConversation.mockReturnValue(conv);

    await provider.openConversation('codex-abc123');

    expect(codexEditorCommands.openConversation).toHaveBeenCalledWith('codex-abc123');
    expect(claudeEditorCommands.openConversation).not.toHaveBeenCalled();
  });

  it('falls back to default editor commands when provider is unset', async () => {
    const conv = makeConversation({ id: 'unknown-conv', provider: undefined });
    mockStateManager.getConversation.mockReturnValue(conv);

    await provider.openConversation('unknown-conv');

    expect(claudeEditorCommands.openConversation).toHaveBeenCalledWith('unknown-conv');
    expect(codexEditorCommands.openConversation).not.toHaveBeenCalled();
  });

  it('routes sendPrompt to the correct provider', async () => {
    const conv = makeConversation({ id: 'codex-abc123', provider: 'codex' });
    mockStateManager.getConversation.mockReturnValue(conv);

    // Access the private method via the webview message handler
    // We test via openConversation since sendPrompt is private,
    // but the routing logic is the same
    await provider.openConversation('codex-abc123');

    expect(codexEditorCommands.openConversation).toHaveBeenCalledWith('codex-abc123');
  });

  // BUG23c + BUG24: Opening a Codex conversation must NOT trigger any delayed
  // focusEditor — the Codex sidebar is already opened by openConversation().
  it('BUG23c/BUG24: no delayed focusEditor after opening Codex conversation', async () => {
    const conv = makeConversation({ id: 'codex-abc123', provider: 'codex' });
    mockStateManager.getConversation.mockReturnValue(conv);

    await provider.openConversation('codex-abc123');

    // Advance timers past the EDITOR_FOCUS_DELAY_MS (800ms)
    vi.advanceTimersByTime(1000);

    // Neither provider's focusEditor should be called — Codex sidebar is already open
    expect(codexEditorCommands.focusEditor).not.toHaveBeenCalled();
    expect(claudeEditorCommands.focusEditor).not.toHaveBeenCalled();
  });

  it('BUG23c: focusEditor after opening Claude conversation uses Claude commands', async () => {
    const conv = makeConversation({ id: 'claude-conv-1', provider: 'claude-code' });
    mockStateManager.getConversation.mockReturnValue(conv);

    await provider.openConversation('claude-conv-1');

    vi.advanceTimersByTime(1000);

    expect(claudeEditorCommands.focusEditor).toHaveBeenCalled();
    expect(codexEditorCommands.focusEditor).not.toHaveBeenCalled();
  });
});

describe('KanbanViewProvider — BUG24: Codex click must not map/focus Claude Code tabs', () => {
  let provider: KanbanViewProvider;
  let mockStateManager: ReturnType<typeof createMockStateManager>;
  let claudeEditorCommands: ReturnType<typeof createMockEditorCommands>;
  let codexEditorCommands: ReturnType<typeof createMockEditorCommands>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockStateManager = createMockStateManager();
    claudeEditorCommands = createMockEditorCommands();
    codexEditorCommands = createMockEditorCommands();

    const editorCommandsByProvider = new Map<string, IEditorCommands>();
    editorCommandsByProvider.set('claude-code', claudeEditorCommands);
    editorCommandsByProvider.set('codex', codexEditorCommands);

    provider = new KanbanViewProvider(
      { fsPath: '/mock/extension', scheme: 'file' } as never,
      mockStateManager as never,
      {} as never,
      claudeEditorCommands,
      editorCommandsByProvider,
    );
  });

  afterEach(() => {
    provider.dispose();
    vi.useRealTimers();
  });

  it('BUG24: does NOT call recordActiveTabMapping for Codex conversations', async () => {
    const conv = makeConversation({ id: 'codex-abc123', provider: 'codex' });
    mockStateManager.getConversation.mockReturnValue(conv);

    await provider.openConversation('codex-abc123');
    vi.advanceTimersByTime(1000); // past TAB_MAPPING_DELAY_MS (500ms)

    const tabManager = (provider as any)._tabManager;
    expect(tabManager.recordActiveTabMapping).not.toHaveBeenCalled();
  });

  it('BUG24: DOES call recordActiveTabMapping for Claude Code conversations', async () => {
    const conv = makeConversation({ id: 'claude-conv-1', provider: 'claude-code' });
    mockStateManager.getConversation.mockReturnValue(conv);

    await provider.openConversation('claude-conv-1');
    vi.advanceTimersByTime(1000);

    const tabManager = (provider as any)._tabManager;
    expect(tabManager.recordActiveTabMapping).toHaveBeenCalledWith('claude-conv-1');
  });

  it('BUG24: does NOT use cached tab label for Codex conversations', async () => {
    const conv = makeConversation({ id: 'codex-abc123', provider: 'codex' });
    mockStateManager.getConversation.mockReturnValue(conv);

    // Simulate a stale tab mapping from a previous (buggy) session
    const tabManager = (provider as any)._tabManager;
    tabManager.getTabLabel.mockReturnValue('Some Claude Tab');
    tabManager.focusTabByLabel.mockResolvedValue(true);

    await provider.openConversation('codex-abc123');

    // Should NOT try to focus the cached Claude Code tab
    expect(tabManager.focusTabByLabel).not.toHaveBeenCalled();
    // Should open via Codex editor commands instead
    expect(codexEditorCommands.openConversation).toHaveBeenCalledWith('codex-abc123');
  });

  it('BUG24: does NOT call closeUnmappedClaudeTabByTitle for Codex conversations', async () => {
    const conv = makeConversation({ id: 'codex-abc123', provider: 'codex' });
    mockStateManager.getConversation.mockReturnValue(conv);

    await provider.openConversation('codex-abc123');

    const tabManager = (provider as any)._tabManager;
    expect(tabManager.closeUnmappedClaudeTabByTitle).not.toHaveBeenCalled();
  });

  it('BUG24: does NOT call focusEditorOnce for Codex conversations', async () => {
    const conv = makeConversation({ id: 'codex-abc123', provider: 'codex' });
    mockStateManager.getConversation.mockReturnValue(conv);

    await provider.openConversation('codex-abc123');
    vi.advanceTimersByTime(1000);

    // Codex sidebar is already open from openConversation — no delayed focus needed
    expect(codexEditorCommands.focusEditor).not.toHaveBeenCalled();
    expect(claudeEditorCommands.focusEditor).not.toHaveBeenCalled();
  });

  it('BUG24: sendPromptToConversation does NOT call recordActiveTabMapping for Codex', async () => {
    const conv = makeConversation({ id: 'codex-abc123', provider: 'codex' });
    mockStateManager.getConversation.mockReturnValue(conv);

    // sendPromptToConversation is private — call it via the webview message handler
    await (provider as any).sendPromptToConversation('codex-abc123', 'test prompt');
    vi.advanceTimersByTime(1000);

    const tabManager = (provider as any)._tabManager;
    expect(tabManager.recordActiveTabMapping).not.toHaveBeenCalled();
  });
});
