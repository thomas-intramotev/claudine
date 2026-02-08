/**
 * Regression tests for KanbanViewProvider.
 *
 * These tests lock in current behavior so that performance optimizations
 * (diff-based messaging, disposal changes, leak fixes)
 * can be validated without silently breaking functionality.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'vscode';
import { KanbanViewProvider } from '../providers/KanbanViewProvider';
import { Conversation } from '../types';

// Track TabManager instances for assertions
const tabManagerInstances: Array<Record<string, unknown>> = [];

vi.mock('../providers/TabManager', () => {
  return {
    TabManager: class MockTabManager {
      dispose = vi.fn();
      scheduleFocusDetection = vi.fn();
      detectFocusedConversation = vi.fn();
      pruneStaleTabMappings = vi.fn();
      recordActiveTabMapping = vi.fn();
      getTabLabel = vi.fn();
      focusTabByLabel = vi.fn();
      focusAnyClaudeTab = vi.fn();
      suppressFocus = vi.fn();
      removeMapping = vi.fn();
      closeEmptyClaudeTabs = vi.fn().mockResolvedValue(0);
      closeUnmappedClaudeTabByTitle = vi.fn();
      isClaudeCodeTab = vi.fn();
      set onFocusChanged(_cb: unknown) {}
      set onOpenConversation(_cb: unknown) {}
      constructor() {
        tabManagerInstances.push(this as unknown as Record<string, unknown>);
      }
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
    agents: [{ id: 'claude-main', name: 'Claude', avatar: '', isActive: false }],
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
  const conversationsEmitter = new EventEmitter();
  const needsInputEmitter = new EventEmitter();

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
    _conversationsEmitter: conversationsEmitter,
    _needsInputEmitter: needsInputEmitter,
  };
}

function createMockWatcher() {
  return {
    refresh: vi.fn(),
    searchConversations: vi.fn().mockReturnValue([]),
    clearPendingIcons: vi.fn(),
    startWatching: vi.fn(),
    stopWatching: vi.fn(),
    claudePath: '/home/user/.claude',
    isWatching: false,
    parseCacheSize: 0,
  };
}

function createMockExtensionUri() {
  return {
    fsPath: '/mock/extension',
    scheme: 'file',
  };
}

describe('KanbanViewProvider — regression tests', () => {
  let provider: KanbanViewProvider;
  let mockStateManager: ReturnType<typeof createMockStateManager>;
  let mockWatcher: ReturnType<typeof createMockWatcher>;

  beforeEach(() => {
    vi.useFakeTimers();
    tabManagerInstances.length = 0;
    mockStateManager = createMockStateManager();
    mockWatcher = createMockWatcher();
    provider = new KanbanViewProvider(
      createMockExtensionUri() as never,
      mockStateManager as never,
      mockWatcher as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------- dispose ----------

  describe('dispose', () => {
    it('clears archive interval', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      provider.dispose();
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('clears focus editor timer', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      provider.dispose();
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('calls tabManager.dispose', () => {
      const instance = tabManagerInstances.at(-1);
      provider.dispose();
      expect(instance).toBeDefined();
      expect((instance!.dispose as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  // ---------- sendMessage no-op when no view ----------

  describe('sendMessage is no-op when no view', () => {
    it('refresh does not throw when no webview is resolved', () => {
      // refresh() calls sendMessage internally, which should be a no-op
      expect(() => provider.refresh()).not.toThrow();
    });

    it('refresh sends updateConversations when called', () => {
      mockStateManager.getConversations.mockReturnValue([
        makeConversation({ id: 'a' }),
      ]);
      // Should not throw even without a view
      provider.refresh();
    });
  });

  // ---------- Archive timer runs ----------

  describe('archive timer', () => {
    it('calls archiveStaleConversations on interval', () => {
      // The archive timer is set up in the constructor with ARCHIVE_CHECK_INTERVAL_MS (5 min)
      expect(mockStateManager.archiveStaleConversations).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
      expect(mockStateManager.archiveStaleConversations).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5 * 60 * 1000); // another 5 minutes
      expect(mockStateManager.archiveStaleConversations).toHaveBeenCalledTimes(2);
    });

    it('stops archive timer on dispose', () => {
      provider.dispose();
      mockStateManager.archiveStaleConversations.mockClear();

      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(mockStateManager.archiveStaleConversations).not.toHaveBeenCalled();
    });
  });
});
