import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IPlatformAdapter, PlatformEventEmitter, PlatformEvent, Disposable } from '../platform/IPlatformAdapter';
import type { Conversation } from '../types';

/**
 * BUG8b — AI summarization produces no summaries and toggle-off has no effect
 *
 * Tests for SummaryService CLI invocation, caching, and toggle behavior.
 */

// Track spawn calls for verification
let spawnCalls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = [];

// Configurable mock child process behavior
let mockStdout = '';
let mockStderr = '';
let mockExitCode = 0;
let mockSpawnError: Error | null = null;

// Mock child_process.spawn
vi.mock('child_process', () => ({
  spawn: (command: string, args: string[], options: Record<string, unknown>) => {
    spawnCalls.push({ command, args, options });
    const ee = new EventEmitter();
    const stdin = {
      write: vi.fn(),
      end: vi.fn(),
    };
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();

    // Simulate async process behavior
    setTimeout(() => {
      if (mockSpawnError) {
        ee.emit('error', mockSpawnError);
        return;
      }
      if (mockStdout) stdout.emit('data', Buffer.from(mockStdout));
      if (mockStderr) stderr.emit('data', Buffer.from(mockStderr));
      ee.emit('close', mockExitCode);
    }, 0);

    return Object.assign(ee, { stdin, stdout, stderr, pid: 12345, kill: vi.fn() });
  },
  execFile: (_cmd: string, _args: string[], _opts: Record<string, unknown>, cb: (err: Error | null, stdout: string) => void) => {
    // Mock `which` — return a path
    cb(null, '/usr/local/bin/claude\n');
  },
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: () => false,
  readdirSync: () => [],
}));

let configStore: Record<string, unknown>;

function createMockPlatform(): IPlatformAdapter {
  return {
    createEventEmitter<T>(): PlatformEventEmitter<T> {
      const ee = new EventEmitter();
      return {
        get event(): PlatformEvent<T> {
          return (listener: (e: T) => void): Disposable => {
            ee.on('data', listener);
            return { dispose: () => { ee.removeListener('data', listener); } };
          };
        },
        fire: (data: T) => { ee.emit('data', data); },
        dispose: () => { ee.removeAllListeners(); }
      };
    },
    watchFiles: () => ({ dispose: () => {} }),
    getConfig: <T>(key: string, d: T) => (configStore[key] !== undefined ? configStore[key] : d) as T,
    setConfig: async <T>(key: string, value: T) => { configStore[key] = value; },
    ensureDirectory: async () => {},
    writeFile: async () => {},
    readFile: async () => new Uint8Array(),
    stat: async () => undefined,
    getGlobalState: (_k: string, d: unknown) => d as never,
    setGlobalState: async () => {},
    getSecret: async () => undefined,
    setSecret: async () => {},
    getGlobalStoragePath: () => '/tmp/claudine-test',
    getWorkspaceFolders: () => null,
    getWorkspaceLocalConfig: <T>(_k: string, d: T) => d as T,
    setWorkspaceLocalConfig: async () => {},
    isDevelopmentMode: () => false,
    getExtensionPath: () => undefined,
  };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'test-1',
    title: 'Fix authentication bug in login flow',
    description: 'The login page fails silently when credentials are invalid.',
    category: 'bug',
    status: 'in-progress',
    lastMessage: 'I found the issue in the auth middleware.',
    agents: [],
    hasError: false,
    isInterrupted: false,
    hasQuestion: false,
    isRateLimited: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Lazy-import SummaryService after mocks are in place
let SummaryService: typeof import('../services/SummaryService').SummaryService;

beforeEach(async () => {
  spawnCalls = [];
  mockStdout = '';
  mockStderr = '';
  mockExitCode = 0;
  mockSpawnError = null;
  configStore = { enableSummarization: true };
  const mod = await import('../services/SummaryService');
  SummaryService = mod.SummaryService;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BUG8b — SummaryService CLI invocation', () => {
  it('passes prompt as positional argument to claude -p (not via stdin)', async () => {
    mockStdout = '[{"title":"Fix auth bug","description":"Login fails silently","lastMessage":"Found issue"}]';

    const service = new SummaryService();
    service.init(createMockPlatform());

    const conversations = [makeConversation()];
    const updates: Array<{ id: string; title: string }> = [];

    service.summarizeUncached(conversations, (id, summary) => {
      updates.push({ id, title: summary.title });
    });

    // Wait for async processing
    await new Promise(r => setTimeout(r, 50));

    // Verify spawn was called
    expect(spawnCalls.length).toBeGreaterThan(0);

    // BUG8b: The prompt must be passed as a positional argument, not via stdin
    const claudeCall = spawnCalls.find(c => c.args.includes('-p') || c.args.includes('--print'));
    expect(claudeCall).toBeDefined();

    // The args should include the prompt as a positional argument after -p
    // Old (broken): ['-p'] + stdin.write(prompt)
    // New (fixed):  ['-p', '--no-session-persistence', prompt]
    const promptArg = claudeCall!.args.find(a => a.includes('Summarize these coding conversations'));
    expect(promptArg).toBeTruthy();
  });

  it('uses --no-session-persistence to avoid creating session files', async () => {
    mockStdout = '[{"title":"Fix auth bug","description":"test","lastMessage":"test"}]';

    const service = new SummaryService();
    service.init(createMockPlatform());

    service.summarizeUncached([makeConversation()], () => {});

    await new Promise(r => setTimeout(r, 50));

    const claudeCall = spawnCalls.find(c => c.args.includes('-p') || c.args.includes('--print'));
    expect(claudeCall).toBeDefined();
    expect(claudeCall!.args).toContain('--no-session-persistence');
  });

  it('handles successful summarization and calls onUpdate', async () => {
    mockStdout = '[{"title":"Fix auth bug","description":"Login fails silently","lastMessage":"Found issue"}]';

    const service = new SummaryService();
    service.init(createMockPlatform());

    const conversations = [makeConversation()];
    const updates: Array<{ id: string; title: string }> = [];

    service.summarizeUncached(conversations, (id, summary) => {
      updates.push({ id, title: summary.title });
    });

    await new Promise(r => setTimeout(r, 50));

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('test-1');
    expect(updates[0].title).toBe('Fix auth bug');
  });

  it('caches summaries and applies them on subsequent calls', async () => {
    mockStdout = '[{"title":"Fix auth bug","description":"Login fails","lastMessage":"Found it"}]';

    const service = new SummaryService();
    service.init(createMockPlatform());

    // First: summarize
    service.summarizeUncached([makeConversation()], () => {});
    await new Promise(r => setTimeout(r, 50));

    // Should be cached now
    expect(service.hasCached('test-1')).toBe(true);

    // Apply cached: should set originalTitle and replace title
    const conv = makeConversation();
    const applied = service.applyCached(conv);
    expect(applied).toBe(true);
    expect(conv.originalTitle).toBe('Fix authentication bug in login flow');
    expect(conv.title).toBe('Fix auth bug');
  });

  it('does nothing when enableSummarization is false', async () => {
    configStore.enableSummarization = false;
    mockStdout = '[{"title":"should not appear"}]';

    const service = new SummaryService();
    service.init(createMockPlatform());

    const updates: string[] = [];
    service.summarizeUncached([makeConversation()], (id) => { updates.push(id); });

    await new Promise(r => setTimeout(r, 50));

    // Should NOT have spawned any CLI process
    expect(spawnCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('handles CLI error gracefully (non-zero exit)', async () => {
    mockExitCode = 1;

    const service = new SummaryService();
    service.init(createMockPlatform());

    const updates: string[] = [];
    service.summarizeUncached([makeConversation()], (id) => { updates.push(id); });

    await new Promise(r => setTimeout(r, 50));

    // No updates should be pushed
    expect(updates).toHaveLength(0);
    // Conversation should not be stuck in pending
    expect(service.hasCached('test-1')).toBe(false);
  });

  it('handles empty CLI output gracefully', async () => {
    mockStdout = ''; // Empty — the BUG8b scenario

    const service = new SummaryService();
    service.init(createMockPlatform());

    const updates: string[] = [];
    service.summarizeUncached([makeConversation()], (id) => { updates.push(id); });

    await new Promise(r => setTimeout(r, 50));

    expect(updates).toHaveLength(0);
    expect(service.hasCached('test-1')).toBe(false);
  });

  it('uses AbortController for proper spawn timeout', async () => {
    // The spawn should have a signal for aborting (proper timeout handling)
    mockStdout = '[{"title":"test","description":"test","lastMessage":"test"}]';

    const service = new SummaryService();
    service.init(createMockPlatform());

    service.summarizeUncached([makeConversation()], () => {});
    await new Promise(r => setTimeout(r, 50));

    const claudeCall = spawnCalls.find(c => c.args.includes('-p') || c.args.includes('--print'));
    expect(claudeCall).toBeDefined();

    // Should use signal instead of invalid timeout option
    expect(claudeCall!.options).toHaveProperty('signal');
    expect(claudeCall!.options).not.toHaveProperty('timeout');
  });
});

describe('BUG8b — applyCached respects enableSummarization setting', () => {
  it('applies cached summary when summarization is ON', async () => {
    mockStdout = '[{"title":"Fix auth","description":"Login fails","lastMessage":"Found it"}]';

    const service = new SummaryService();
    service.init(createMockPlatform());

    // Generate and cache summary (enableSummarization is true)
    service.summarizeUncached([makeConversation()], () => {});
    await new Promise(r => setTimeout(r, 50));

    const conv = makeConversation();
    const applied = service.applyCached(conv);
    expect(applied).toBe(true);
    expect(conv.originalTitle).toBe('Fix authentication bug in login flow');
    expect(conv.title).toBe('Fix auth');
  });

  it('does NOT apply cached summary when summarization is OFF', async () => {
    mockStdout = '[{"title":"Fix auth","description":"Login fails","lastMessage":"Found it"}]';

    const service = new SummaryService();
    service.init(createMockPlatform());

    // Generate and cache summary while ON
    service.summarizeUncached([makeConversation()], () => {});
    await new Promise(r => setTimeout(r, 50));
    expect(service.hasCached('test-1')).toBe(true);

    // Toggle OFF
    configStore.enableSummarization = false;

    // applyCached should refuse to apply — conversation keeps original title
    const conv = makeConversation();
    const applied = service.applyCached(conv);
    expect(applied).toBe(false);
    expect(conv.title).toBe('Fix authentication bug in login flow');
    expect(conv.originalTitle).toBeUndefined();
  });

  it('re-applies cached summary when toggled back ON', async () => {
    mockStdout = '[{"title":"Fix auth","description":"Login fails","lastMessage":"Found it"}]';

    const service = new SummaryService();
    service.init(createMockPlatform());

    // Generate and cache
    service.summarizeUncached([makeConversation()], () => {});
    await new Promise(r => setTimeout(r, 50));

    // Toggle OFF → ON
    configStore.enableSummarization = false;
    const convOff = makeConversation();
    expect(service.applyCached(convOff)).toBe(false);
    expect(convOff.title).toBe('Fix authentication bug in login flow');

    configStore.enableSummarization = true;
    const convOn = makeConversation();
    expect(service.applyCached(convOn)).toBe(true);
    expect(convOn.title).toBe('Fix auth');
    expect(convOn.originalTitle).toBe('Fix authentication bug in login flow');
  });
});
