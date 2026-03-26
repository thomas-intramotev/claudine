# Monitored Workspace Setting

## Problem

When Claudine can't match VSCode workspace folders to Claude Code project directories (e.g. no workspace open, or mismatched paths), it falls back to scanning **all** projects under `~/.claude/projects/`. This silently shows conversations from unrelated workspaces on the board, confusing the user.

## Solution

Add a **Monitored Workspace** section to the Settings panel that:

1. Shows which workspace path(s) are currently being monitored
2. Lets the user switch between three modes: Auto, Single path, Multi-path
3. Triggers a rescan when the setting changes

## Workspace Modes

| Mode | Behavior |
|------|----------|
| `auto` | Uses VSCode's open workspace folders (current default behavior). Displays detected paths as read-only info. |
| `single` | User picks one folder via native dialog. Only that path is scanned. |
| `multi` | User builds a list of folders via native dialog. All listed paths are scanned. |

## Data Model

### New type in `src/types/index.ts`

```typescript
export type MonitoredWorkspace =
  | { mode: 'auto' }
  | { mode: 'single'; path: string }
  | { mode: 'multi'; paths: string[] };
```

### Extended `ClaudineSettings`

```typescript
export interface ClaudineSettings {
  // ... existing fields ...
  monitoredWorkspace: MonitoredWorkspace;
  /** Read-only: workspace paths currently detected by VSCode (for display in auto mode). */
  detectedWorkspacePaths: string[];
}
```

Default value: `{ mode: 'auto' }`.

## Settings Panel UI

New section in `SettingsPanel.svelte`, placed **above** the Image Generation section (workspace monitoring is a more fundamental setting):

```
┌─ Monitored Workspace ─────────────────────────┐
│                                                │
│  Mode: [Auto (VSCode workspace) ▾]            │
│                                                │
│  Currently monitoring:                         │
│  ┌──────────────────────────────────────┐      │
│  │ /Users/matthias/Development/claudine │      │
│  └──────────────────────────────────────┘      │
└────────────────────────────────────────────────┘
```

### Auto mode
- Dropdown shows "Auto (VSCode workspace)"
- Below: read-only display of detected workspace path(s) as grey chips
- If no workspace detected: shows "No workspace detected — scanning all projects" in warning style

### Single path mode
- Dropdown shows "Single path"
- Below: the selected path as a chip + "Browse..." button
- If no path selected yet: just the "Browse..." button with helper text

### Multi-path mode
- Dropdown shows "Multiple paths"
- Below: list of path chips, each with an ✕ remove button
- "Add path..." button at the bottom
- Empty state: "No paths configured" + "Add path..." button

## Extension ↔ Webview Messages

### New webview→extension messages

```typescript
| { type: 'browseWorkspaceFolder' }
```

Triggers `vscode.window.showOpenDialog({ canSelectFolders: true, canSelectMany: false })`. On selection, the extension updates the setting and sends back updated settings.

### New extension→webview messages

No new message types needed — the existing `updateSettings` message carries the updated `monitoredWorkspace` and `detectedWorkspacePaths` fields.

## Extension-Side Changes

### `KanbanViewProvider.ts`

1. **`handleWebviewMessage`**: Handle `browseWorkspaceFolder` — open native folder picker, update the `monitoredWorkspace` config, call `updateSettings()` + trigger provider rescan.

2. **`updateSettings()`**: Read `monitoredWorkspace` from config, populate `detectedWorkspacePaths` from `platform.getWorkspaceFolders()`, include both in the settings object.

3. **`updateSetting` case**: Add `monitoredWorkspace` to `ALLOWED_SETTING_KEYS`. When it changes, also trigger `provider.refresh()` to rescan with the new paths.

### `ClaudeCodeWatcher.ts`

Modify `getProjectDirsToScan()`:

```
Current logic:
  if (workspaceFolders exist) → scan matching project dirs
  else → scan ALL project dirs (fallback)

New logic:
  1. Read monitoredWorkspace setting from config
  2. If mode === 'single' → use [setting.path] as workspace folders
  3. If mode === 'multi' → use setting.paths as workspace folders
  4. If mode === 'auto' → use platform.getWorkspaceFolders() (current behavior)
  5. If auto + no workspace folders → scan all (current fallback, but now the UI makes it visible)
```

The modification is minimal — just override the `workspaceFolders` variable before the existing encoding/matching logic runs.

## VSCode Configuration

Add to `package.json` contributes.configuration:

```json
{
  "claudine.monitoredWorkspace": {
    "type": "object",
    "default": { "mode": "auto" },
    "description": "Which workspace path(s) to monitor for Claude Code conversations"
  }
}
```

## Edge Cases

| Case | Handling |
|------|----------|
| Auto mode, no workspace open | Show warning text: "No workspace detected — scanning all projects". Board shows all conversations (current behavior, but now visible). |
| Invalid/deleted path in single/multi mode | Show path chip with warning style (orange border). Skip during scan, log warning. Don't remove — user may want to re-mount. |
| Mode changed | Trigger full `provider.refresh()` to rescan. Conversations from old paths are removed; new paths are loaded. |
| Extension startup | Read setting from config before first scan. No behavioral change for `auto` mode. |

## Files to Modify

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `MonitoredWorkspace` type, extend `ClaudineSettings` |
| `webview/src/components/SettingsPanel.svelte` | Add monitored workspace UI section |
| `webview/src/stores/conversations.ts` | Update default settings to include `monitoredWorkspace` and `detectedWorkspacePaths` |
| `src/providers/KanbanViewProvider.ts` | Handle `browseWorkspaceFolder` message; read/write new setting; include detected paths in settings |
| `src/providers/ClaudeCodeWatcher.ts` | Read `monitoredWorkspace` config in `getProjectDirsToScan()` to override workspace folder logic |
| `package.json` | Add `claudine.monitoredWorkspace` configuration property |

## Testing

1. **Auto mode (default)**: Verify current behavior unchanged — only workspace-matching conversations shown
2. **Auto mode, no workspace**: Verify all conversations shown + warning displayed in settings
3. **Single path**: Pick a folder, verify only that folder's conversations appear, verify rescan on change
4. **Multi-path**: Add/remove paths, verify correct conversations shown after each change
5. **Invalid path**: Set a non-existent path, verify warning style + graceful skip
6. **Persistence**: Change mode, reload VSCode, verify setting preserved
7. **Browse dialog**: Verify native folder picker opens and selected path is applied
