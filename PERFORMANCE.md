# Performance Audit — Claudine VSCode Extension

Comprehensive analysis of computational efficiency, memory usage, resource leaks, power consumption, and UX degradation scenarios.

Each issue references the source file and line number, a severity rating, and the regression test(s) that guard against breakage during optimization.

---

## Table of Contents

1. [Memory — Extension Host](#1-memory--extension-host)
2. [Memory — Webview](#2-memory--webview)
3. [CPU / Computation Hotspots](#3-cpu--computation-hotspots)
4. [Resource Leaks](#4-resource-leaks)
5. [Power Consumption](#5-power-consumption)
6. [UX Degradation Scenarios](#6-ux-degradation-scenarios)
7. [Recommendations](#7-recommendations)
8. [Verification Checklist](#8-verification-checklist)

---

## 1. Memory — Extension Host

### M1 · Unbounded Parse Cache — HIGH

**File:** `src/providers/ConversationParser.ts:31`

```ts
private _cache = new Map<string, ParseCache>();
```

The `_cache` map grows without limit. Every JSONL file ever parsed stays in memory. Each `ParseCache` entry stores all `ParsedMessage` objects for that file, including `toolUses` arrays with arbitrary `input` objects.

**Impact:** With 100 conversations averaging 200 messages each, this can reach 50–100 MB of retained heap. The extension never evicts entries for conversations that are no longer active.

**Regression tests:** `ConversationParser.perf.test.ts` — "maintains independent caches for multiple files", "clearCache removes specific file without affecting others"

---

### M2 · Full File Load Into Memory — HIGH

**File:** `src/providers/ConversationParser.ts:86`

```ts
const content = fs.readFileSync(filePath, 'utf-8');
```

Cold parses read the entire JSONL file into a single string. A conversation with heavy tool use (code edits, file writes) can produce a 10–50 MB JSONL file. The incremental path (line 106–117) also allocates a `Buffer` + string for the new bytes.

**Impact:** Two copies in memory at peak: the raw Buffer and the decoded UTF-8 string.

**Regression tests:** `ConversationParser.perf.test.ts` — "returns same result on cold parse and incremental re-parse with appended data", "parses 500+ messages correctly"

---

### M3 · Intermediate Line Array — MEDIUM

**File:** `src/providers/ConversationParser.ts:125`

```ts
const lines = content.split('\n');
```

Creates a string array proportional to message count. For a 500-message conversation, this is 500+ strings that are immediately iterated and discarded. A streaming line reader would avoid this allocation.

**Regression tests:** `ConversationParser.perf.test.ts` — "parses 500+ messages correctly"

---

### M4 · Full Tool Input Storage — MEDIUM

**File:** `src/providers/ConversationParser.ts:175–178`

```ts
toolUses.push({
  name: block.name,
  input: block.input || {}
});
```

Every `tool_use` block's full `input` object is retained in `ParsedMessage.toolUses`. For `Write` tool calls, this includes entire file contents. For `Edit` calls, both `old_string` and `new_string`. These are stored permanently in the cache.

**Impact:** A single Write of a 5 KB file means 5 KB retained indefinitely in heap per tool call.

**Regression tests:** `ConversationParser.perf.test.ts` — "extracts tool uses with large inputs correctly"

---

### M5 · Base64 Icons in Conversation Objects — MEDIUM

**File:** `src/types/index.ts:27`

```ts
icon?: string;
```

Each conversation can carry a base64-encoded icon (PNG/WebP up to 512 KB raw → ~680 KB base64). These are stored in-memory, persisted to `state.json`, and broadcast to the webview via `postMessage`.

**Impact:** With 50 conversations × 200 KB average icon = 10 MB of base64 strings in the extension host, duplicated in `state.json`, duplicated again in the webview.

**Regression tests:** `StateManager.perf.test.ts` — "retains all icons after 5 rapid setConversationIcon calls", "persists conversations with icons via saveBoardState"

---

### M6 · SummaryService Cache Unbounded — MEDIUM

**File:** `src/services/SummaryService.ts:29`

```ts
private _cache: Record<string, CachedSummary> = {};
```

Persisted to `globalState` without size limits. Over months of use, this accumulates summaries for every conversation ever created, even deleted ones.

**Impact:** `globalState` has a 1 MB default limit in some VS Code versions. Beyond that, writes silently fail.

---

### M7 · CommandProcessor Unbounded Processed Set — LOW

**File:** `src/services/CommandProcessor.ts:26`

```ts
private _processedIds = new Set<string>();
```

Grows forever. Every processed command ID stays in memory for the extension lifetime.

---

### M8 · Duplicate Conversation Data Copies — HIGH

Three copies of the full conversation list exist simultaneously:

1. `StateManager._conversations` Map — `src/services/StateManager.ts:6`
2. `StorageService` writes to `state.json` — `src/services/StorageService.ts`
3. Webview receives full array via `postMessage` — `src/providers/KanbanViewProvider.ts:43`

Each `notifyChange()` creates a new sorted array (copy #4) and sends it via structured clone to the webview (copy #5).

**Regression tests:** `StateManager.perf.test.ts` — "onConversationsChanged delivers sorted array on each notification", "setConversations removes stale IDs atomically"

---

### M9 · Redundant `fs.statSync` in `buildConversation` — LOW

**File:** `src/providers/ConversationParser.ts:238`

```ts
const stats = fs.statSync(filePath);
```

`statSync` is already called in `parseFile` (line 54) to get the file size. The result is not passed through, so `buildConversation` calls it again just for `birthtime`/`mtime`. With JSONL timestamps available, this stat call is almost always unnecessary.

**Regression tests:** `ConversationParser.perf.test.ts` — "uses JSONL timestamps for createdAt and updatedAt, not fs.stat"

---

### M10 · Synchronous Full-File Read in `searchConversations` — HIGH

**File:** `src/providers/ClaudeCodeWatcher.ts:290`

```ts
const content = fs.readFileSync(filePath, 'utf-8');
```

Search reads every JSONL file completely and synchronously. With 50 files averaging 1 MB each, this blocks the extension host for hundreds of milliseconds.

**Regression tests:** `ClaudeCodeWatcher.perf.test.ts` — "returns correct IDs for matching content", "is case-insensitive", "returns empty for blank query"

---

## 2. Memory — Webview

### W1 · Full State Broadcast on Every Change — HIGH

**File:** `src/providers/KanbanViewProvider.ts:43`

```ts
this._stateManager.onConversationsChanged((conversations) => {
  this.sendMessage({ type: 'updateConversations', conversations });
});
```

Every single-field update (icon change, status change, title update) triggers a full broadcast of all conversations to the webview. With 50 conversations carrying icons, each `postMessage` can be 10+ MB of structured-clone data.

**Impact:** Structured clone of large arrays blocks the extension host main thread.

**Regression tests:** `StateManager.perf.test.ts` — "fires once per updateConversation call", "onConversationsChanged delivers sorted array"

---

### W2 · Duplicate Stores in Webview — MEDIUM

**File:** `webview/src/stores/conversations.ts:7,158`

Two writable stores hold the same data:
- `conversations` — the raw array
- `conversationsByStatus` — a derived grouping

When `conversations` updates, `conversationsByStatus` is immediately recomputed. Then `boardItems` in `KanbanBoard.svelte` creates a third copy for drag-and-drop.

---

### W3 · `firstConversationId` Derived Creates Date Objects — LOW

**File:** `webview/src/stores/conversations.ts:104–113`

```ts
export const firstConversationId = derived(conversations, ($convs) => {
  // Creates new Date() for every conversation on every update
```

Every conversation update triggers `new Date()` construction for all conversations just to find the first one.

---

### W4 · `searchMatchIds` Recomputes on Every Update — MEDIUM

**File:** `webview/src/stores/conversations.ts:119–136`

Even when the search query hasn't changed, `searchMatchIds` recomputes on every `conversations` store update because it's derived from both.

---

### W5 · Per-Card Activity Timer — HIGH

**File:** `webview/src/components/TaskCard.svelte:60–61`

```ts
setInterval(() => { ... }, 1000);
```

Every visible TaskCard runs a 1-second interval to update its "last active" timestamp. With 50 cards, that's 50 timer callbacks per second, each potentially triggering Svelte reactivity.

---

## 3. CPU / Computation Hotspots

### C1 · Synchronous `fs.readdirSync` / `fs.readFileSync` — HIGH

**Files:**
- `src/providers/ClaudeCodeWatcher.ts:181` — `readdirSync`
- `src/providers/ClaudeCodeWatcher.ts:290` — `readFileSync` in search
- `src/providers/ConversationParser.ts:86` — `readFileSync` in parse

All file I/O is synchronous, blocking the extension host's single Node.js thread. During a refresh scan of 50 conversations, this can block for 500ms+.

**Regression tests:** `ClaudeCodeWatcher.perf.test.ts` — "refresh calls setConversations with all parsed conversations"

---

### C2 · `getConversations()` Sorts on Every Call — HIGH

**File:** `src/services/StateManager.ts:53–56`

```ts
public getConversations(): Conversation[] {
  return Array.from(this._conversations.values())
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
```

Called from: `notifyChange()`, `refresh()`, `saveState()`, `archiveStaleConversations()`, `getConversationsByStatus()`, `closeEmptyClaudeTabs()`, `detectFocusedConversation()`. Each call creates a new sorted array. During a single `setConversations`, this method is called 3+ times.

**Regression tests:** `StateManager.perf.test.ts` — "returns consistent sort after rapid mutations", "onConversationsChanged delivers sorted array on each notification"

---

### C3 · O(n²) `extractWorkspacePath` with fs.existsSync — MEDIUM

**File:** `src/providers/ConversationParser.ts:517–553`

Nested loop with up to `n × (n-1) / 2` iterations, each calling `fs.existsSync`. For a path like `-Users-matthias-Development-my-cool-project`, that's 5 segments with 15 `existsSync` calls per conversation.

**Regression tests:** `ConversationParser.perf.test.ts` — "handles hyphenated directories in encoded path"

---

### C4 · Notification Cascade on `setConversations` — HIGH

**File:** `src/services/StateManager.ts:62–86`

`setConversations` calls:
1. `archiveStaleConversations()` → may call `notifyChange()` + `saveState()` → `getConversations()` ×2
2. `notifyChange()` → `getConversations()` ×1
3. `saveState()` → `getConversations()` ×1

Total: up to 6 `getConversations()` calls (each sorting) + 3 `saveState()` calls (each serializing to disk) for a single scan.

**Regression tests:** `StateManager.perf.test.ts` — "calls saveBoardState after every updateConversation", "calls saveBoardState after every moveConversation"

---

### C5 · No Cached Sorted Array — MEDIUM

Related to C2. A simple invalidation flag + cached array would eliminate redundant sorts. Currently every mutation → 2–3 full re-sorts.

**Regression tests:** `StateManager.perf.test.ts` — "returns consistent sort after rapid mutations"

---

### C6 · No Batched Notifications — MEDIUM

**File:** `src/services/StateManager.ts:88–93`

`updateConversation` fires `notifyChange()` + `saveState()` immediately. During a refresh scan, if 50 conversations are updated via `setConversations`, plus individual `updateConversation` calls from the summary service, each one triggers a full broadcast + disk write.

**Regression tests:** `StateManager.perf.test.ts` — "fires once per updateConversation call", "onNeedsInput fires exactly once per transition"

---

### C7 · No Debounced Saves — HIGH

**File:** `src/services/StateManager.ts:45–51`

```ts
private async saveState() {
  const conversations = this.getConversations();
  await this._storageService.saveBoardState({ conversations, lastUpdated: new Date() });
}
```

Every single mutation writes to disk. Setting icons for 50 conversations = 50 separate file writes. A 200ms debounce would collapse these into 1 write.

**Regression tests:** `StateManager.perf.test.ts` — "calls saveBoardState after every setConversationIcon", "retains all icons after 5 rapid setConversationIcon calls"

---

### C8 · No Search Index — LOW

**File:** `src/providers/ClaudeCodeWatcher.ts:275–304`

Search does a linear scan + `readFileSync` + `toLowerCase().includes()` over every file on every keystroke (after debounce). No inverted index, no cached content.

**Regression tests:** `ClaudeCodeWatcher.perf.test.ts` — "returns correct IDs for matching content", "is case-insensitive"

---

## 4. Resource Leaks

### L1 · `onDidReceiveMessage` Not Tracked in `_disposables` — HIGH

**File:** `src/providers/KanbanViewProvider.ts:74–78`

```ts
webviewView.webview.onDidReceiveMessage(
  (message: WebviewToExtensionMessage) => {
    this.handleWebviewMessage(message);
  }
);
```

The subscription return value (a `Disposable`) is not pushed to `_disposables`. When `resolveWebviewView` is called again (panel ↔ sidebar switch), the old handler is never disposed. Both old and new handlers fire for each message.

**Regression tests:** `KanbanViewProvider.perf.test.ts` — "clears archive interval", "calls tabManager.dispose"

---

### L2 · `onDidChangeVisibility` Not Tracked in `_disposables` — HIGH

**File:** `src/providers/KanbanViewProvider.ts:80–84`

Same issue as L1. The visibility handler leaks on every `resolveWebviewView` call.

---

### L3 · `onConversationsChanged` Subscription Never Disposed — MEDIUM

**File:** `src/providers/KanbanViewProvider.ts:42–44`

```ts
this._stateManager.onConversationsChanged((conversations) => {
  this.sendMessage({ type: 'updateConversations', conversations });
});
```

Created in the constructor, the return `Disposable` is discarded. This subscription lives for the entire extension lifetime — acceptable if the provider is a singleton, but it's a hidden assumption.

---

### L4 · `dispose()` Never Called from `extension.ts` — HIGH

**File:** `src/extension.ts`

The `deactivate()` function disposes the watcher but never calls `kanbanProvider.dispose()`. The archive interval, focus timer, and all `_disposables` leak until the extension host process exits.

**Regression tests:** `KanbanViewProvider.perf.test.ts` — "stops archive timer on dispose", "clears archive interval", "clears focus editor timer"

---

### L5 · Fire-and-Forget `setTimeout` Handles — MEDIUM

**File:** `src/providers/KanbanViewProvider.ts:229,255`

```ts
setTimeout(() => this._tabManager.recordActiveTabMapping(conversationId), TAB_MAPPING_DELAY_MS);
```

These timers are not tracked. If `dispose()` is called while a timer is pending, the callback fires after disposal, potentially accessing a stale `_tabManager`.

---

### L6 · SummaryService Child Processes Not Killed on Deactivate — MEDIUM

**File:** `src/services/SummaryService.ts:139–171`

`child_process.spawn()` is used with a 60s timeout, but `deactivate()` doesn't kill active children. If the extension deactivates while a summarization batch is running, the child process continues until its timeout.

---

### L7 · No Cleanup of Stale `globalState` Summary Cache — LOW

**File:** `src/services/SummaryService.ts:198–199`

```ts
private saveCache() {
  this._context?.globalState.update('summaryCache', this._cache);
}
```

Summaries for deleted conversations are never pruned from `globalState`.

---

## 5. Power Consumption

### P1 · Always-On Archive Check Interval — MEDIUM

**File:** `src/providers/KanbanViewProvider.ts:46–48`

```ts
this._archiveTimer = setInterval(() => {
  this._stateManager.archiveStaleConversations();
}, ARCHIVE_CHECK_INTERVAL_MS); // 5 minutes
```

Runs every 5 minutes regardless of whether the webview is visible, whether VS Code is idle, or whether any conversations are in done/cancelled state.

**Regression tests:** `KanbanViewProvider.perf.test.ts` — "calls archiveStaleConversations on interval"

---

### P2 · Per-Card 1-Second Interval — HIGH

**File:** `webview/src/components/TaskCard.svelte:60–61`

50 cards × 1 call/second = 50 DOM updates/second just for "last active" timestamps. Most of these produce no visible change (timestamps only change resolution at minute boundaries).

---

### P3 · FileSystemWatcher on Entire `projects/` Tree — MEDIUM

**File:** `src/providers/ClaudeCodeWatcher.ts:67`

```ts
const watchPattern = new vscode.RelativePattern(projectsPath, '**/*.jsonl');
```

On macOS, `FSEvents` is used (kernel-level, low overhead). On Linux, `inotify` watches are created per directory. With many project directories, this can exhaust `fs.inotify.max_user_watches`.

---

### P4 · `retainContextWhenHidden: true` — MEDIUM

**File:** `src/extension.ts:57`

The webview stays alive when hidden. All per-card intervals, stores, and derived computations continue running even when the user isn't looking at the board.

---

### P5 · CSS `count-pulse` Animation — LOW

**File:** `webview/src/components/TaskCard.svelte:693–696`

The pulsing animation on active conversation badges uses CSS animation that triggers continuous repaints for every card with an active agent.

---

### P6 · Focus Detection on Every Tab/Editor Change — LOW

**File:** `src/providers/KanbanViewProvider.ts:87–98`

Three separate event subscriptions (`onDidChangeTabs`, `onDidChangeActiveTextEditor`, `onDidChangeActiveTerminal`) each trigger debounced focus detection. In a fast tab-switching scenario, the debounce (150ms) collapses most, but the pattern is noisy.

---

## 6. UX Degradation Scenarios

### U1 · Large Workspace with Many Conversations

**Trigger:** 100+ JSONL files, some multi-MB.

**Impact:** Initial `refresh()` blocks the extension host for 2–5 seconds (sync I/O). The Kanban board is blank during this time. Subsequent `postMessage` with 100 full conversations + icons can be 50+ MB, causing the webview to freeze.

---

### U2 · Rapid Summarization Updates

**Trigger:** 50 conversations return from CLI summarization in quick succession.

**Impact:** Each `updateConversation` triggers: sort + save + broadcast. 50 updates = 50 disk writes + 50 full-state broadcasts. User sees the board flickering as it re-renders 50 times.

---

### U3 · Search with Many Large Files

**Trigger:** User types in search box → `searchConversations` reads all files synchronously.

**Impact:** On every keystroke (after debounce), all JSONL files are read from disk. With 50 × 2 MB files = 100 MB of synchronous I/O, the extension host hangs for 1–3 seconds per search keystroke.

---

### U4 · Icon Generation Burst

**Trigger:** First load with 50 conversations and image generation API configured.

**Impact:** 50 sequential API calls (OpenAI/Stability). Each generates a ~200 KB base64 string. Each `setConversationIcon` → save + broadcast. User sees 50 board re-renders as icons trickle in.

---

### U5 · Panel ↔ Sidebar Switch Leak Accumulation

**Trigger:** User switches between panel and sidebar view multiple times.

**Impact:** Each switch calls `resolveWebviewView`, which leaks `onDidReceiveMessage` and `onDidChangeVisibility` handlers (L1, L2). After 10 switches, 10 duplicate handlers fire for every message.

---

### U6 · Extension Development Host Overhead

**Trigger:** Developing the extension while using it.

**Impact:** The EDH workspace exclusion (line 35) prevents EDH conversations from appearing, but the watcher still processes all FSEvents for the entire `projects/` tree including the excluded workspace.

---

### U7 · globalState Overflow

**Trigger:** Months of use with summarization enabled.

**Impact:** `summaryCache` in `globalState` grows unbounded. VS Code's default `globalState` quota is typically 1 MB. Silent write failures when exceeded, leading to lost summaries and repeated re-summarization.

---

### U8 · Linux inotify Exhaustion

**Trigger:** Large `~/.claude/projects` directory tree on Linux.

**Impact:** The `**/*.jsonl` glob pattern creates an `inotify` watch per directory. With many project directories, this can hit the system `fs.inotify.max_user_watches` limit (default 8192 on some distros), causing "ENOSPC: System limit for number of file watchers reached" errors.

---

## 7. Recommendations

### P0 — Critical (Do First)

| # | Action | Issues | Regression Tests |
|---|--------|--------|-----------------|
| R1 | **Dispose `onDidReceiveMessage` and `onDidChangeVisibility` in `_disposables`** | L1, L2, U5 | `KanbanViewProvider.perf.test.ts` |
| R2 | **Call `kanbanProvider.dispose()` in `deactivate()`** | L4 | `KanbanViewProvider.perf.test.ts` — "stops archive timer on dispose" |
| R3 | **Add LRU eviction to `ConversationParser._cache`** (cap at active workspace count + 10) | M1 | `ConversationParser.perf.test.ts` — "clearCache removes specific file", "maintains independent caches" |
| R4 | **Debounce `saveState()` by 200ms** | C7, U2, U4 | `StateManager.perf.test.ts` — "calls saveBoardState after every setConversationIcon", "retains all icons after 5 rapid calls" |

### P1 — High Impact

| # | Action | Issues | Regression Tests |
|---|--------|--------|-----------------|
| R5 | **Cache sorted array, invalidate on mutation** | C2, C5, C4 | `StateManager.perf.test.ts` — "returns consistent sort after rapid mutations" |
| R6 | **Send diffs instead of full state to webview** | W1, M8 | `StateManager.perf.test.ts` — "onConversationsChanged delivers sorted array" |
| R7 | **Convert sync I/O to async** (`readFile`, `readdir`, `stat`) | C1, M2, U1, U3 | `ClaudeCodeWatcher.perf.test.ts` — "refresh calls setConversations", `ConversationParser.perf.test.ts` — all cache/parse tests |
| R8 | **Store icons separately** (not in Conversation object) | M5, M8, W1 | `StateManager.perf.test.ts` — "persists conversations with icons" |

### P2 — Medium Impact

| # | Action | Issues | Regression Tests |
|---|--------|--------|-----------------|
| R9 | **Strip large tool inputs before caching** (keep only `name` and key metadata) | M4 | `ConversationParser.perf.test.ts` — "extracts tool uses with large inputs correctly" |
| R10 | **Replace per-card `setInterval` with a single board-level timer** | W5, P2 | (Webview tests — not currently covered by regression suite) |
| R11 | **Coalesce notifications**: batch updates within a microtask or 50ms window | C6, U2 | `StateManager.perf.test.ts` — "fires once per updateConversation call", "onNeedsInput fires exactly once per transition" |
| R12 | **Prune stale entries from `summaryCache`** on each save | M6, L7, U7 | (Not covered — new test needed) |
| R13 | **Pause archive interval when webview is hidden** | P1, P4 | `KanbanViewProvider.perf.test.ts` — "calls archiveStaleConversations on interval" |

### P3 — Low Impact / Long-Term

| # | Action | Issues | Regression Tests |
|---|--------|--------|-----------------|
| R14 | **Stream JSONL lines** instead of `split('\n')` | M3 | `ConversationParser.perf.test.ts` — "parses 500+ messages correctly" |
| R15 | **Build a lightweight search index** (inverted term → file map) | C8, U3 | `ClaudeCodeWatcher.perf.test.ts` — "returns correct IDs for matching content" |
| R16 | **Remove redundant `statSync` in `buildConversation`** | M9 | `ConversationParser.perf.test.ts` — "uses JSONL timestamps for createdAt and updatedAt" |

---

## 8. Verification Checklist

### Automated

- [ ] `npm test` — all 110 tests pass (73 existing + 37 regression)
- [ ] No new TypeScript errors: `npx tsc --noEmit`

### Manual — Extension Host

- [ ] Open extension with 50+ conversations → board loads within 2s
- [ ] Search does not freeze the extension host
- [ ] Switch panel ↔ sidebar 5 times → no duplicate message handlers
- [ ] Close and reopen VS Code → no "ENOSPC" watcher errors on Linux
- [ ] Check Process Explorer (Developer: Open Process Explorer) → extension host memory < 150 MB

### Manual — Webview

- [ ] Webview memory (via Chrome DevTools in webview) stays < 50 MB with 50 conversations
- [ ] No visible flicker when icons are set one by one
- [ ] Search input is responsive (< 200ms per keystroke)
- [ ] "Last active" timestamps update without excessive DOM thrashing

### Profiling

- [ ] Capture extension host CPU profile during `refresh()` — no function > 100ms
- [ ] Capture heap snapshot before and after loading 50 conversations — no growing retained sets
- [ ] Capture webview performance timeline — no layout thrashing from per-card timers
