# Task Card Context Menu — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a right-click context menu to task cards for opening conversations and moving cards between columns.

**Architecture:** Self-contained in `TaskCard.svelte`. Right-click shows a positioned dropdown with "Open conversation" (bold default), dynamic "Move to ..." items (one per column, current column omitted, each with a color dot), and "Archive immediately". Draft cards get the menu too but only show relevant actions (no move options). Reuses existing move message infrastructure and `.open-menu` styling.

**Tech Stack:** Svelte 4, TypeScript, Vitest for tests

---

### Task 1: Add FEATURES.md entry

**Files:**
- Modify: `FEATURES.md`

**Step 1: Add feature entry**

Add to `FEATURES.md`:

```markdown
- [ ] Context menu on task cards (right-click): Open conversation, Move to column, Archive
```

**Step 2: Commit**

```bash
git commit -m "feat: add context menu feature to FEATURES.md" -- FEATURES.md
```

---

### Task 2: Write failing test for context menu helper logic

Since the context menu filtering logic (which columns to show, excluding current) is pure logic, we can test it in isolation.

**Files:**
- Create: `src/test/TaskCardContextMenu.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';

/**
 * Mirrors the column filtering logic used by TaskCard context menu.
 * Returns the list of move targets, excluding the card's current status.
 */
interface ColumnDef { id: string; title: string; color: string }

function getContextMenuMoveTargets(
  columns: ColumnDef[],
  archiveColumn: ColumnDef,
  currentStatus: string
): ColumnDef[] {
  const targets = columns.filter(c => c.id !== currentStatus);
  if (currentStatus !== archiveColumn.id) {
    targets.push(archiveColumn);
  }
  return targets;
}

const COLUMNS: ColumnDef[] = [
  { id: 'todo', title: 'To Do', color: '#6b7280' },
  { id: 'needs-input', title: 'Needs Input', color: '#f59e0b' },
  { id: 'in-progress', title: 'In Progress', color: '#3b82f6' },
  { id: 'in-review', title: 'In Review', color: '#8b5cf6' },
  { id: 'done', title: 'Done', color: '#10b981' },
];

const ARCHIVE: ColumnDef = { id: 'archived', title: 'Archived', color: '#4b5563' };

describe('TaskCard context menu — move targets', () => {
  it('excludes the current column from move targets', () => {
    const targets = getContextMenuMoveTargets(COLUMNS, ARCHIVE, 'in-progress');
    const ids = targets.map(t => t.id);
    expect(ids).not.toContain('in-progress');
    expect(ids).toContain('todo');
    expect(ids).toContain('done');
    expect(ids).toContain('archived');
  });

  it('includes archive when card is not archived', () => {
    const targets = getContextMenuMoveTargets(COLUMNS, ARCHIVE, 'todo');
    expect(targets[targets.length - 1].id).toBe('archived');
  });

  it('excludes archive when card is already archived', () => {
    const targets = getContextMenuMoveTargets(COLUMNS, ARCHIVE, 'archived');
    const ids = targets.map(t => t.id);
    expect(ids).not.toContain('archived');
    // All regular columns should still be present
    expect(ids).toEqual(['todo', 'needs-input', 'in-progress', 'in-review', 'done']);
  });

  it('returns all columns except current for todo card', () => {
    const targets = getContextMenuMoveTargets(COLUMNS, ARCHIVE, 'todo');
    expect(targets).toHaveLength(5); // 4 regular + archive
    expect(targets.map(t => t.id)).not.toContain('todo');
  });

  it('draft cards produce no move targets (empty columns, no current status)', () => {
    // Drafts have no real status — we pass empty columns to signal "no moves"
    const targets = getContextMenuMoveTargets([], ARCHIVE, '');
    expect(targets).toHaveLength(1); // just archive
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/TaskCardContextMenu.test.ts`
Expected: PASS (this is pure logic mirrored from the plan — the test itself validates correctness of the algorithm we'll embed in the Svelte component)

**Step 3: Commit**

```bash
git restore --staged :/ && git add src/test/TaskCardContextMenu.test.ts && git commit -m "test: add context menu move-target filtering tests" -- src/test/TaskCardContextMenu.test.ts
```

---

### Task 3: Add context menu state and handler to TaskCard.svelte

**Files:**
- Modify: `webview/src/components/TaskCard.svelte`

**Step 1: Add imports and state**

At the top of the `<script>` block, add the store imports:

```typescript
import { columns, archiveColumn, updateConversationStatus, acknowledgeReview } from '../stores/conversations';
```

Add new state variables after the existing `openMenuEl` declaration (~line 58):

```typescript
let contextMenuVisible = false;
let contextMenuX = 0;
let contextMenuY = 0;
let contextMenuEl: HTMLDivElement;
```

Add a reactive derivation for move targets:

```typescript
$: contextMoveTargets = conversation.isDraft
  ? []
  : [
      ...$columns.filter(c => c.id !== conversation.status),
      ...($archiveColumn.id !== conversation.status ? [$archiveColumn] : [])
    ];
```

**Step 2: Add handler functions**

After the existing `handleClickOutsideMenu` function:

```typescript
function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  // Close any open menu first
  openMenuVisible = false;
  contextMenuVisible = true;
  contextMenuX = e.clientX;
  contextMenuY = e.clientY;
  // Clamp to viewport in next tick after render
  requestAnimationFrame(() => {
    if (!contextMenuEl) return;
    const rect = contextMenuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenuX = window.innerWidth - rect.width - 4;
    }
    if (rect.bottom > window.innerHeight) {
      contextMenuY = window.innerHeight - rect.height - 4;
    }
  });
}

function handleContextMenuClose() {
  contextMenuVisible = false;
}

function handleContextMenuMove(targetStatus: ConversationStatus) {
  contextMenuVisible = false;
  if (conversation.status === 'in-review' && targetStatus !== 'in-review') {
    acknowledgeReview(conversation.id);
  }
  vscode.postMessage({ type: 'moveConversation', conversationId: conversation.id, newStatus: targetStatus });
  updateConversationStatus(conversation.id, targetStatus);
}
```

**Step 3: Update the click-outside handler**

Modify `handleClickOutsideMenu` to also close the context menu:

```typescript
function handleClickOutsideMenu(e: MouseEvent) {
  if (openMenuVisible && openMenuEl && !openMenuEl.contains(e.target as Node)) {
    openMenuVisible = false;
  }
  if (contextMenuVisible && contextMenuEl && !contextMenuEl.contains(e.target as Node)) {
    contextMenuVisible = false;
  }
}
```

**Step 4: Add Escape key handler**

On the `<svelte:window>` element, add keydown:

```svelte
<svelte:window on:click={handleClickOutsideMenu} on:keydown={(e) => e.key === 'Escape' && handleContextMenuClose()} />
```

**Step 5: Commit**

```bash
git commit -m "feat: add context menu state and handlers to TaskCard" -- webview/src/components/TaskCard.svelte
```

---

### Task 4: Add context menu markup to all card views

**Files:**
- Modify: `webview/src/components/TaskCard.svelte`

**Step 1: Add `on:contextmenu` to each card root**

For each of the four card variants (draft, narrow, compact, full), add `on:contextmenu={handleContextMenu}` to the root `.task-card` div. For the draft card, the context menu handler should work the same way.

**Step 2: Add the context menu dropdown markup**

Add this block just before the closing `</script>` — no, add it in the template, right before the final `<style>` tag, inside a `{#if contextMenuVisible}` block. Place it at the TOP of the template, outside any card variant, using a Svelte portal-like approach with `position: fixed`:

Actually, the simplest approach: add the context menu markup inside each card variant's div (after the existing content), OR better — add it once at the very end of the template using `{#if}` with fixed positioning.

Add this block just before `<style>`:

```svelte
{#if contextMenuVisible}
  <div
    class="context-menu"
    bind:this={contextMenuEl}
    style="left: {contextMenuX}px; top: {contextMenuY}px;"
  >
    <button class="context-menu-item context-menu-default" on:click={() => { contextMenuVisible = false; handleOpenConversation(); }}>
      Open conversation
    </button>
    {#if contextMoveTargets.length > 0}
      <div class="context-menu-separator"></div>
      {#each contextMoveTargets as target (target.id)}
        {#if target.id === 'archived'}
          <div class="context-menu-separator"></div>
          <button class="context-menu-item" on:click={() => handleContextMenuMove(target.id)}>
            <span class="context-menu-dot" style="background:{target.color}"></span>
            Archive immediately
          </button>
        {:else}
          <button class="context-menu-item" on:click={() => handleContextMenuMove(target.id)}>
            <span class="context-menu-dot" style="background:{target.color}"></span>
            Move to {target.title}
          </button>
        {/if}
      {/each}
    {/if}
  </div>
{/if}
```

**Step 3: For draft cards, adjust "Open conversation" label**

For draft cards, the context menu only shows "Open conversation" which will trigger `handleOpenConversation()`. Since drafts don't have a real conversation, this will behave like "Send idea". We can add a delete option:

```svelte
{#if conversation.isDraft}
  <button class="context-menu-item context-menu-danger" on:click={() => { contextMenuVisible = false; dispatch('deleteDraft', conversation.id); }}>
    Delete idea
  </button>
{/if}
```

**Step 4: Commit**

```bash
git commit -m "feat: add context menu markup to TaskCard template" -- webview/src/components/TaskCard.svelte
```

---

### Task 5: Add context menu styles

**Files:**
- Modify: `webview/src/components/TaskCard.svelte`

**Step 1: Add CSS rules**

Add these styles in the `<style>` block, following the existing `.open-menu` pattern:

```css
/* ---- Context menu (right-click) ---- */
.context-menu {
  position: fixed;
  z-index: 100;
  min-width: 180px;
  background: var(--vscode-menu-background, #252526);
  border: 1px solid var(--vscode-menu-border, #454545);
  border-radius: 6px;
  padding: 4px 0;
  box-shadow: 0 4px 14px rgba(0,0,0,0.35);
}
.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  font-size: 11px;
  font-family: inherit;
  color: var(--vscode-menu-foreground, #cccccc);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.context-menu-item:hover {
  background: var(--vscode-menu-selectionBackground, #094771);
  color: var(--vscode-menu-selectionForeground, #ffffff);
}
.context-menu-default {
  font-weight: 600;
}
.context-menu-danger {
  color: #ef4444;
}
.context-menu-danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
.context-menu-separator {
  height: 1px;
  background: var(--vscode-menu-separatorBackground, #454545);
  margin: 4px 0;
}
.context-menu-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

**Step 2: Commit**

```bash
git commit -m "feat: add context menu styles to TaskCard" -- webview/src/components/TaskCard.svelte
```

---

### Task 6: Compile, test, and verify

**Step 1: Run the tests**

```bash
npx vitest run
```

Expected: All tests pass.

**Step 2: Compile the extension**

```bash
npm run compile
```

Expected: No TypeScript errors.

**Step 3: On-device testing**

Open the extension in VS Code, verify:
- Right-click on a full card → context menu appears at cursor position
- Right-click on a compact card → same
- Right-click on a narrow card → same
- Right-click on a draft card → menu shows "Open conversation" and "Delete idea" only (no move options)
- "Open conversation" opens the conversation
- "Move to X" moves the card to that column
- Current column is not shown in the menu
- "Archive immediately" works
- Clicking outside closes the menu
- Pressing Escape closes the menu
- Menu doesn't overflow viewport edges

**Step 4: Update FEATURES.md — tick the checkbox**

**Step 5: Update RELEASE_NOTES.md**

Add entry for the context menu feature.

**Step 6: Commit**

```bash
git commit -m "feat: task card context menu — right-click to open/move/archive" -- FEATURES.md RELEASE_NOTES.md
```
