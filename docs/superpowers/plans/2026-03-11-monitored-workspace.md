# Monitored Workspace Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users see and control which workspace path(s) Claudine monitors for conversations, via a new section in the Settings panel.

**Architecture:** Add a `MonitoredWorkspace` discriminated union type to settings. The webview Settings panel renders the mode selector and path list. The extension host handles folder browsing via native dialog and passes the configured paths to `ClaudeCodeWatcher.getProjectDirsToScan()` to override the default VSCode workspace detection.

**Tech Stack:** TypeScript, Svelte 4, VSCode Extension API (`showOpenDialog`), Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/index.ts` | Modify | Add `MonitoredWorkspace` type, extend `ClaudineSettings` |
| `src/providers/ClaudeCodeWatcher.ts` | Modify | Read monitored workspace config in `getProjectDirsToScan()` and `isFromCurrentWorkspace()` |
| `src/providers/KanbanViewProvider.ts` | Modify | Handle `browseWorkspaceFolder` message, persist setting, trigger rescan |
| `webview/src/stores/conversations.ts` | Modify | Update default settings shape |
| `webview/src/components/SettingsPanel.svelte` | Modify | Add monitored workspace UI section |
| `package.json` | Modify | Add `claudine.monitoredWorkspace` config property |
| `src/test/MonitoredWorkspace.test.ts` | Create | Tests for workspace path resolution logic |

---

## Task 1: Add types and config schema

**Files:**
- Modify: `src/types/index.ts:141-153` (ClaudineSettings)
- Modify: `package.json:221-284` (configuration section)

- [ ] **Step 1: Add `MonitoredWorkspace` type to `src/types/index.ts`**

Above `ClaudineSettings`, add:

```typescript
export type MonitoredWorkspace =
  | { mode: 'auto' }
  | { mode: 'single'; path: string }
  | { mode: 'multi'; paths: string[] };
```

- [ ] **Step 2: Extend `ClaudineSettings` in `src/types/index.ts`**

Add two fields to the interface:

```typescript
monitoredWorkspace: MonitoredWorkspace;
detectedWorkspacePaths: string[];
```

- [ ] **Step 3: Add `browseWorkspaceFolder` to `WebviewToExtensionMessage`**

Add to the union:

```typescript
| { type: 'browseWorkspaceFolder' }
```

- [ ] **Step 4: Add config property to `package.json`**

After the `claudine.showTaskGitBranch` entry (line ~282), add:

```json
"claudine.monitoredWorkspace": {
  "type": "object",
  "default": { "mode": "auto" },
  "description": "Which workspace path(s) to monitor for conversations. Modes: auto (use VSCode workspace), single (one path), multi (multiple paths)."
}
```

- [ ] **Step 5: Update default settings in `webview/src/stores/conversations.ts`**

In the `settings` writable default (line ~33), add:

```typescript
monitoredWorkspace: { mode: 'auto' } as MonitoredWorkspace,
detectedWorkspacePaths: [],
```

Add `MonitoredWorkspace` to the import from `'../lib/vscode'`.

- [ ] **Step 6: Compile to verify types**

Run: `npm run compile`
Expected: Clean compilation

- [ ] **Step 7: Commit**

```bash
git restore --staged :/ && git add src/types/index.ts package.json webview/src/stores/conversations.ts && git commit -m "feat: add MonitoredWorkspace type and config schema"
```

---

## Task 2: Extension-side setting read/write and folder browse

**Files:**
- Modify: `src/providers/KanbanViewProvider.ts:189-210` (updateSetting case)
- Modify: `src/providers/KanbanViewProvider.ts:559-576` (updateSettings method)

- [ ] **Step 1: Update `updateSettings()` to include new fields**

In `KanbanViewProvider.updateSettings()` (~line 559), after reading existing config values, add:

```typescript
const rawMonitored = config.get<MonitoredWorkspace>('monitoredWorkspace', { mode: 'auto' });
// Ensure valid shape
const monitoredWorkspace: MonitoredWorkspace = (rawMonitored && typeof rawMonitored === 'object' && 'mode' in rawMonitored)
  ? rawMonitored as MonitoredWorkspace
  : { mode: 'auto' };
const detectedWorkspacePaths = this._provider.getWorkspacePaths?.() ?? [];
```

Add both fields to the `settings` object literal:

```typescript
monitoredWorkspace,
detectedWorkspacePaths,
```

Import `MonitoredWorkspace` from `'../types'`.

- [ ] **Step 2: Add `getWorkspacePaths()` to `IConversationProvider`**

In `src/providers/IConversationProvider.ts`, add an optional method:

```typescript
/** Return the workspace paths currently detected by the platform (for settings display). */
getWorkspacePaths?(): string[];
```

- [ ] **Step 3: Implement `getWorkspacePaths()` in `ClaudeCodeWatcher`**

```typescript
public getWorkspacePaths(): string[] {
  return this._platform.getWorkspaceFolders() ?? [];
}
```

- [ ] **Step 4: Add `monitoredWorkspace` to `ALLOWED_SETTING_KEYS`**

In the `updateSetting` case (~line 190), add `'monitoredWorkspace'` to the array.

- [ ] **Step 5: Trigger rescan when `monitoredWorkspace` changes**

In the `updateSetting` case, after the `config.update().then(...)` block for allowed keys, add a check: if `message.key === 'monitoredWorkspace'`, also call `this._provider.refresh()` inside the `.then()`:

```typescript
config.update(message.key, message.value, vscode.ConfigurationTarget.Global).then(() => {
  this.updateSettings();
  if (message.key === 'monitoredWorkspace') {
    this._provider.refresh();
  }
});
```

- [ ] **Step 6: Handle `browseWorkspaceFolder` message**

Add a new case in `handleWebviewMessage`:

```typescript
case 'browseWorkspaceFolder': {
  vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Select Workspace Folder'
  }).then(uris => {
    if (uris && uris.length > 0) {
      const folderPath = uris[0].fsPath;
      this.sendMessage({ type: 'folderSelected', path: folderPath });
    }
  });
  break;
}
```

- [ ] **Step 7: Add `folderSelected` to `ExtensionToWebviewMessage`**

In `src/types/index.ts`, add to the union:

```typescript
| { type: 'folderSelected'; path: string }
```

- [ ] **Step 8: Compile to verify**

Run: `npm run compile`
Expected: Clean compilation

- [ ] **Step 9: Commit**

```bash
git restore --staged :/ && git add src/providers/KanbanViewProvider.ts src/providers/IConversationProvider.ts src/providers/ClaudeCodeWatcher.ts src/types/index.ts && git commit -m "feat: extension-side monitored workspace setting and folder browse"
```

---

## Task 3: Wire `getProjectDirsToScan()` to use monitored workspace config

**Files:**
- Modify: `src/providers/ClaudeCodeWatcher.ts:262-313` (getProjectDirsToScan)
- Modify: `src/providers/ClaudeCodeWatcher.ts:207-217` (isFromCurrentWorkspace)
- Create: `src/test/MonitoredWorkspace.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/MonitoredWorkspace.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeWatcher } from '../providers/ClaudeCodeWatcher';
import { StateManager } from '../services/StateManager';

// Minimal platform adapter mock
function createMockPlatform(overrides: Record<string, unknown> = {}) {
  return {
    getWorkspaceFolders: vi.fn(() => overrides.workspaceFolders ?? null),
    getConfig: vi.fn((key: string, defaultValue: unknown) => {
      if (key === 'claudeCodePath') return '/tmp/test-claude';
      if (key === 'monitoredWorkspace') return overrides.monitoredWorkspace ?? { mode: 'auto' };
      return defaultValue;
    }),
    setConfig: vi.fn(),
    watchFiles: vi.fn(() => ({ dispose: vi.fn() })),
    isDevelopmentMode: vi.fn(() => false),
    getExtensionPath: vi.fn(() => undefined),
    showOpenDialog: vi.fn(),
  };
}

function createMockStateManager() {
  return {
    setConversations: vi.fn(),
    updateConversation: vi.fn(),
    removeConversation: vi.fn(),
    getConversation: vi.fn(),
    loadState: vi.fn(),
    saveDrafts: vi.fn(),
    loadDrafts: vi.fn(() => []),
    clearAllIcons: vi.fn(),
    getRateLimitedConversations: vi.fn(() => []),
    on: vi.fn(),
    onConversationsChanged: vi.fn(),
  } as unknown as StateManager;
}

describe('MonitoredWorkspace — getProjectDirsToScan', () => {
  const claudeDir = '/tmp/test-claude';
  const projectsDir = path.join(claudeDir, 'projects');

  beforeEach(() => {
    // Create fake project dirs
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === projectsDir) return true;
      if (s.startsWith(projectsDir)) return true;
      return false;
    });
    vi.spyOn(fs, 'readdirSync').mockImplementation(((p: string) => {
      if (p === projectsDir) {
        return [
          { name: '-Users-alice-projectA', isDirectory: () => true, isFile: () => false },
          { name: '-Users-alice-projectB', isDirectory: () => true, isFile: () => false },
          { name: '-tmp-scratch', isDirectory: () => true, isFile: () => false },
        ];
      }
      return [];
    }) as typeof fs.readdirSync);
  });

  it('auto mode with workspace folders scans only matching dirs', () => {
    const platform = createMockPlatform({
      workspaceFolders: ['/Users/alice/projectA'],
      monitoredWorkspace: { mode: 'auto' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    // Access private method via bracket notation for testing
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain('-Users-alice-projectA');
  });

  it('auto mode without workspace folders scans all (excluding temp)', () => {
    const platform = createMockPlatform({
      workspaceFolders: null,
      monitoredWorkspace: { mode: 'auto' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    // Should include projectA and projectB, but exclude -tmp-scratch
    expect(dirs).toHaveLength(2);
  });

  it('single mode uses configured path instead of workspace folders', () => {
    const platform = createMockPlatform({
      workspaceFolders: ['/Users/alice/projectA'],
      monitoredWorkspace: { mode: 'single', path: '/Users/alice/projectB' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toContain('-Users-alice-projectB');
  });

  it('multi mode uses all configured paths', () => {
    const platform = createMockPlatform({
      workspaceFolders: null,
      monitoredWorkspace: { mode: 'multi', paths: ['/Users/alice/projectA', '/Users/alice/projectB'] },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    expect(dirs).toHaveLength(2);
    expect(dirs[0]).toContain('-Users-alice-projectA');
    expect(dirs[1]).toContain('-Users-alice-projectB');
  });

  it('single mode with invalid path returns empty', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === projectsDir) return true;
      // The encoded path dir doesn't exist
      return false;
    });
    const platform = createMockPlatform({
      monitoredWorkspace: { mode: 'single', path: '/Users/alice/nonexistent' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const dirs = (watcher as any).getProjectDirsToScan(projectsDir);
    expect(dirs).toHaveLength(0);
  });
});

describe('MonitoredWorkspace — isFromCurrentWorkspace', () => {
  it('single mode accepts files from configured path', () => {
    const platform = createMockPlatform({
      workspaceFolders: ['/Users/alice/projectA'],
      monitoredWorkspace: { mode: 'single', path: '/Users/alice/projectB' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const filePath = '/tmp/test-claude/projects/-Users-alice-projectB/conv123.jsonl';
    expect((watcher as any).isFromCurrentWorkspace(filePath)).toBe(true);
  });

  it('single mode rejects files from non-configured path', () => {
    const platform = createMockPlatform({
      workspaceFolders: ['/Users/alice/projectA'],
      monitoredWorkspace: { mode: 'single', path: '/Users/alice/projectB' },
    });
    const watcher = new ClaudeCodeWatcher(createMockStateManager(), platform as any);
    const filePath = '/tmp/test-claude/projects/-Users-alice-projectA/conv123.jsonl';
    expect((watcher as any).isFromCurrentWorkspace(filePath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/MonitoredWorkspace.test.ts`
Expected: FAIL — `getProjectDirsToScan` doesn't read `monitoredWorkspace` config yet

- [ ] **Step 3: Modify `getProjectDirsToScan()` in `ClaudeCodeWatcher.ts`**

Replace the method body (lines 262–313) with logic that reads the monitored workspace config first:

```typescript
private getProjectDirsToScan(projectsPath: string): string[] {
  const dirs: string[] = [];

  try {
    if (!fs.existsSync(projectsPath)) {
      console.warn(`Claudine: Projects path does not exist: ${projectsPath}`);
      return dirs;
    }

    // Read monitored workspace setting
    const monitored = this._platform.getConfig<{ mode: string; path?: string; paths?: string[] }>(
      'monitoredWorkspace', { mode: 'auto' }
    );

    // Determine effective workspace folders based on mode
    let effectiveFolders: string[] | null = null;

    if (monitored.mode === 'single' && monitored.path) {
      effectiveFolders = [monitored.path];
    } else if (monitored.mode === 'multi' && monitored.paths && monitored.paths.length > 0) {
      effectiveFolders = monitored.paths;
    } else {
      // Auto mode: use VSCode workspace folders
      effectiveFolders = this._platform.getWorkspaceFolders();
    }

    if (effectiveFolders && effectiveFolders.length > 0) {
      // Only scan project directories that match the effective folders
      for (const folder of effectiveFolders) {
        // Skip the extension's own workspace when running in EDH
        if (this._excludedWorkspacePath && folder === this._excludedWorkspacePath) {
          console.log(`Claudine: Skipping extension dev workspace: ${folder}`);
          continue;
        }

        const encodedPath = this.encodeWorkspacePath(folder);
        const projectDir = path.join(projectsPath, encodedPath);

        console.log(`Claudine: Workspace "${folder}" → encoded "${encodedPath}"`);

        if (fs.existsSync(projectDir)) {
          dirs.push(projectDir);
          console.log(`Claudine: Matched project dir: ${projectDir}`);
        } else {
          console.warn(`Claudine: No project dir found for workspace: ${projectDir}`);
        }
      }
    } else {
      // No workspace open & auto mode — scan all projects as fallback
      console.log('Claudine: No workspace folders, scanning all projects');
      const entries = fs.readdirSync(projectsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const exclusion = ClaudeCodeWatcher.isExcludedProjectDir(entry.name);
        if (exclusion.excluded) {
          console.log(`Claudine: Auto-excluding project dir "${entry.name}" — ${exclusion.reason}`);
          continue;
        }
        dirs.push(path.join(projectsPath, entry.name));
      }
    }
  } catch (error) {
    console.error('Claudine: Error listing project directories', error);
  }

  return dirs;
}
```

- [ ] **Step 4: Modify `isFromCurrentWorkspace()` to respect monitored workspace config**

Replace the method body (lines 207–217):

```typescript
private isFromCurrentWorkspace(filePath: string): boolean {
  const monitored = this._platform.getConfig<{ mode: string; path?: string; paths?: string[] }>(
    'monitoredWorkspace', { mode: 'auto' }
  );

  let effectiveFolders: string[] | null = null;

  if (monitored.mode === 'single' && monitored.path) {
    effectiveFolders = [monitored.path];
  } else if (monitored.mode === 'multi' && monitored.paths && monitored.paths.length > 0) {
    effectiveFolders = monitored.paths;
  } else {
    effectiveFolders = this._platform.getWorkspaceFolders();
  }

  if (!effectiveFolders || effectiveFolders.length === 0) return true; // fallback: allow all

  for (const folder of effectiveFolders) {
    if (this._excludedWorkspacePath && folder === this._excludedWorkspacePath) continue;
    const encodedPath = this.encodeWorkspacePath(folder);
    if (filePath.includes(`${path.sep}${encodedPath}${path.sep}`)) return true;
  }
  return false;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/test/MonitoredWorkspace.test.ts`
Expected: All PASS

- [ ] **Step 6: Run all existing tests to check for regressions**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git restore --staged :/ && git add src/providers/ClaudeCodeWatcher.ts src/test/MonitoredWorkspace.test.ts && git commit -m "feat: getProjectDirsToScan respects monitoredWorkspace config"
```

---

## Task 4: Settings panel UI

**Files:**
- Modify: `webview/src/components/SettingsPanel.svelte`

- [ ] **Step 1: Add monitored workspace section to the Settings panel**

At the top of the `<script>` block, add imports and state:

```typescript
import { get } from 'svelte/store';
import type { MonitoredWorkspace } from '../lib/vscode';

let pendingBrowseAction: 'set-single' | 'add-multi' | null = null;
```

Add the message listener for `folderSelected` inside the existing `handleTestResult` function (or a combined message handler):

```typescript
function handleMessage(event: MessageEvent) {
  const msg = event.data;
  if (msg.type === 'apiTestResult') {
    testing = false;
    testResult = msg.success ? 'success' : 'error';
    setTimeout(() => { testResult = null; }, 3000);
  }
  if (msg.type === 'folderSelected' && msg.path) {
    const current = $settings.monitoredWorkspace;
    if (pendingBrowseAction === 'set-single') {
      updateSetting('monitoredWorkspace', { mode: 'single', path: msg.path });
    } else if (pendingBrowseAction === 'add-multi') {
      const existing = current.mode === 'multi' ? current.paths : [];
      if (!existing.includes(msg.path)) {
        updateSetting('monitoredWorkspace', { mode: 'multi', paths: [...existing, msg.path] });
      }
    }
    pendingBrowseAction = null;
  }
}
```

Replace the `onMount`/`onDestroy` to use the combined handler:

```typescript
onMount(() => window.addEventListener('message', handleMessage));
onDestroy(() => window.removeEventListener('message', handleMessage));
```

Remove the old `handleTestResult` listener setup.

Add helper functions:

```typescript
function browseFolder(action: 'set-single' | 'add-multi') {
  pendingBrowseAction = action;
  vscode.postMessage({ type: 'browseWorkspaceFolder' });
}

function handleModeChange(e: Event) {
  const mode = (e.target as HTMLSelectElement).value;
  if (mode === 'auto') {
    updateSetting('monitoredWorkspace', { mode: 'auto' });
  } else if (mode === 'single') {
    updateSetting('monitoredWorkspace', { mode: 'single', path: '' });
  } else if (mode === 'multi') {
    updateSetting('monitoredWorkspace', { mode: 'multi', paths: [] });
  }
}

function removeMonitoredPath(pathToRemove: string) {
  const current = $settings.monitoredWorkspace;
  if (current.mode === 'multi') {
    updateSetting('monitoredWorkspace', {
      mode: 'multi',
      paths: current.paths.filter(p => p !== pathToRemove)
    });
  }
}

function formatPath(p: string): string {
  const home = '~';
  // Show shortened path for display
  const parts = p.split('/');
  if (parts.length > 3) {
    return `…/${parts.slice(-2).join('/')}`;
  }
  return p;
}
```

- [ ] **Step 2: Add the HTML template**

Insert the following right after the `<div class="settings-header">` block and before the Image Generation `<label class="field">`:

```svelte
<div class="field">
  <span class="field-label">Monitored Workspace</span>
  <select value={$settings.monitoredWorkspace.mode} on:change={handleModeChange}>
    <option value="auto">Auto (VSCode workspace)</option>
    <option value="single">Single path</option>
    <option value="multi">Multiple paths</option>
  </select>
</div>

{#if $settings.monitoredWorkspace.mode === 'auto'}
  <div class="workspace-info">
    {#if $settings.detectedWorkspacePaths.length > 0}
      {#each $settings.detectedWorkspacePaths as wsPath}
        <span class="path-chip" title={wsPath}>{formatPath(wsPath)}</span>
      {/each}
    {:else}
      <span class="path-warning">No workspace detected — scanning all projects</span>
    {/if}
  </div>
{:else if $settings.monitoredWorkspace.mode === 'single'}
  <div class="workspace-info">
    {#if $settings.monitoredWorkspace.path}
      <span class="path-chip" title={$settings.monitoredWorkspace.path}>
        {formatPath($settings.monitoredWorkspace.path)}
      </span>
    {/if}
    <button class="browse-btn" on:click={() => browseFolder('set-single')}>
      {$settings.monitoredWorkspace.path ? 'Change…' : 'Browse…'}
    </button>
  </div>
{:else if $settings.monitoredWorkspace.mode === 'multi'}
  <div class="workspace-info">
    {#if $settings.monitoredWorkspace.paths && $settings.monitoredWorkspace.paths.length > 0}
      {#each $settings.monitoredWorkspace.paths as wsPath}
        <span class="path-chip removable" title={wsPath}>
          {formatPath(wsPath)}
          <button class="remove-path" on:click={() => removeMonitoredPath(wsPath)}>✕</button>
        </span>
      {/each}
    {:else}
      <span class="path-hint">No paths configured</span>
    {/if}
    <button class="browse-btn" on:click={() => browseFolder('add-multi')}>Add path…</button>
  </div>
{/if}
```

- [ ] **Step 3: Add CSS styles**

Add to the `<style>` block:

```css
.workspace-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.path-chip {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 3px;
  background: var(--vscode-input-background, #3c3c3c);
  color: var(--vscode-input-foreground, #cccccc);
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.path-chip.removable {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.remove-path {
  background: none;
  border: none;
  color: var(--vscode-descriptionForeground, #8c8c8c);
  cursor: pointer;
  font-size: 10px;
  padding: 0 2px;
  line-height: 1;
}
.remove-path:hover {
  color: var(--vscode-errorForeground, #f48771);
}
.path-warning {
  font-size: 9px;
  color: var(--vscode-editorWarning-foreground, #cca700);
  font-style: italic;
}
.path-hint {
  font-size: 9px;
  color: var(--vscode-descriptionForeground, #8c8c8c);
  font-style: italic;
}
.browse-btn {
  padding: 3px 8px;
  border-radius: 3px;
  border: 1px solid var(--vscode-panel-border, #404040);
  background: var(--vscode-button-secondaryBackground, #3a3d41);
  color: var(--vscode-button-secondaryForeground, #cccccc);
  font-size: 10px;
  cursor: pointer;
  align-self: flex-start;
}
.browse-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground, #45494e);
}
```

- [ ] **Step 4: Compile and verify**

Run: `npm run compile`
Expected: Clean compilation

- [ ] **Step 5: Commit**

```bash
git restore --staged :/ && git add webview/src/components/SettingsPanel.svelte && git commit -m "feat: settings panel UI for monitored workspace"
```

---

## Task 5: Export type from webview lib and ensure message flow

**Files:**
- Modify: `webview/src/lib/vscode.ts` (re-export `MonitoredWorkspace` type if needed)

- [ ] **Step 1: Check if `MonitoredWorkspace` needs re-exporting**

The webview imports types from `'../lib/vscode'`. Check if `MonitoredWorkspace` is already available through the re-exports. If not, add it to the re-export list in `webview/src/lib/vscode.ts`.

- [ ] **Step 2: Compile full project**

Run: `npm run compile`
Expected: Clean compilation

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit if changes were needed**

```bash
git restore --staged :/ && git add webview/src/lib/vscode.ts && git commit -m "feat: re-export MonitoredWorkspace type for webview"
```

---

## Task 6: Update RELEASE_NOTES.md and FEATURES.md

**Files:**
- Modify: `RELEASE_NOTES.md`
- Modify: `FEATURES.md`

- [ ] **Step 1: Add feature entry to FEATURES.md**

```markdown
- [x] Monitored Workspace setting in Settings panel
  - Auto mode (VSCode workspace detection)
  - Single path mode with native folder picker
  - Multi-path mode with add/remove
```

- [ ] **Step 2: Add release note**

Add a new section or append to the current release section:

```markdown
* Monitored Workspace: See which workspace path is being monitored in Settings. Switch between auto-detection, a single path, or multiple paths.
```

- [ ] **Step 3: Commit**

```bash
git restore --staged :/ && git add RELEASE_NOTES.md FEATURES.md && git commit -m "docs: add monitored workspace feature to release notes"
```
