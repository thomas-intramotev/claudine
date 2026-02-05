<script lang="ts">
  import { dndzone, SHADOW_PLACEHOLDER_ITEM_ID } from 'svelte-dnd-action';
  import KanbanColumn from './KanbanColumn.svelte';
  import TaskCard from './TaskCard.svelte';
  import {
    conversationsByStatus, columns, updateConversationStatus,
    searchMatchIds, searchMode, searchQuery, compactView, collapsedCardIds, focusedConversationId
  } from '../stores/conversations';
  import { vscode, type Conversation, type ConversationStatus } from '../lib/vscode';

  const flipDurationMs = 200;

  // Local board items that the DnD library owns during drag operations.
  // Synced FROM the store whenever the extension pushes new data,
  // but NOT written back to the store during drag (avoids store.set()
  // triggering re-renders of all dndzone actions mid-drag).
  let boardItems: Record<ConversationStatus, Conversation[]> = {
    'todo': [], 'needs-input': [], 'in-progress': [], 'in-review': [], 'done': [], 'cancelled': []
  };

  // Reactive sync: when the store changes (extension data), update local items.
  // The spread ensures boardItems is a fresh object so Svelte detects the change.
  $: boardItems = { ...$conversationsByStatus };

  function handleDndConsider(columnId: ConversationStatus, e: CustomEvent<{ items: Conversation[] }>) {
    boardItems[columnId] = e.detail.items;
  }

  function handleDndFinalize(columnId: ConversationStatus, e: CustomEvent<{ items: Conversation[] }>) {
    boardItems[columnId] = e.detail.items;
    for (const item of e.detail.items) {
      if (item.id !== SHADOW_PLACEHOLDER_ITEM_ID && item.status !== columnId) {
        vscode.postMessage({ type: 'moveConversation', conversationId: item.id, newStatus: columnId });
        updateConversationStatus(item.id, columnId);
      }
    }
  }

  function isVisible(id: string, matchIds: Set<string> | null, mode: string): boolean {
    if (!matchIds) return true;
    if (mode === 'hide') return matchIds.has(id);
    return true;
  }

  function isFaded(id: string, matchIds: Set<string> | null, mode: string): boolean {
    if (!matchIds) return false;
    return mode === 'fade' && !matchIds.has(id);
  }

  function isCompact(id: string, global: boolean, collapsed: Set<string>, matchIds: Set<string> | null): boolean {
    const base = global || collapsed.has(id);
    // Search matches force-expand so hits are visible
    if (base && matchIds?.has(id)) return false;
    return base;
  }
</script>

<div class="kanban-board">
  {#each columns as column (column.id)}
    <div class="column-wrapper">
      <KanbanColumn title={column.title} color={column.color} count={boardItems[column.id].length} activeCount={boardItems[column.id].filter(c => c.agents.some(a => a.isActive)).length}>
        <div
          class="drop-zone"
          use:dndzone={{ items: boardItems[column.id], flipDurationMs, dragHandleSelector: '.drag-handle', dropTargetStyle: { outline: `2px dashed ${column.color}`, outlineOffset: '2px' } }}
          on:consider={(e) => handleDndConsider(column.id, e)}
          on:finalize={(e) => handleDndFinalize(column.id, e)}
        >
          {#each boardItems[column.id] as conversation (conversation.id)}
            {#if isVisible(conversation.id, $searchMatchIds, $searchMode)}
              <div class:faded={isFaded(conversation.id, $searchMatchIds, $searchMode)}>
                <TaskCard {conversation} compact={isCompact(conversation.id, $compactView, $collapsedCardIds, $searchMatchIds)} searchQuery={$searchQuery} focused={$focusedConversationId === conversation.id} />
              </div>
            {/if}
          {/each}
          {#if boardItems[column.id].length === 0}
            <div class="empty-state">No conversations</div>
          {/if}
        </div>

        {#if column.id === 'done'}
          <div class="cancelled-section">
            <div class="cancelled-header">
              <span class="cancelled-icon">⊘</span> Cancelled
              <span class="count">{boardItems['cancelled'].length}</span>
            </div>
            <div
              class="drop-zone cancelled"
              use:dndzone={{ items: boardItems['cancelled'], flipDurationMs, dragHandleSelector: '.drag-handle', dropTargetStyle: { outline: '2px dashed #6b7280', outlineOffset: '2px' } }}
              on:consider={(e) => handleDndConsider('cancelled', e)}
              on:finalize={(e) => handleDndFinalize('cancelled', e)}
            >
              {#each boardItems['cancelled'] as conversation (conversation.id)}
                {#if isVisible(conversation.id, $searchMatchIds, $searchMode)}
                  <div class:faded={isFaded(conversation.id, $searchMatchIds, $searchMode)}>
                    <TaskCard {conversation} compact={isCompact(conversation.id, $compactView, $collapsedCardIds, $searchMatchIds)} searchQuery={$searchQuery} focused={$focusedConversationId === conversation.id} />
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      </KanbanColumn>
    </div>
  {/each}
</div>

<style>
  .kanban-board { display: flex; gap: 12px; padding: 12px; overflow-x: auto; flex: 1; min-height: 0; align-items: stretch; }
  .column-wrapper { flex: 1; min-width: 260px; max-width: 350px; display: flex; flex-direction: column; }
  .drop-zone { min-height: 80px; padding: 6px; border-radius: 6px; transition: all 0.2s ease; }
  .drop-zone.cancelled { min-height: 40px; opacity: 0.7; }
  .empty-state { display: flex; align-items: center; justify-content: center; height: 60px; color: var(--vscode-disabledForeground, #6b6b6b); font-size: 11px; font-style: italic; }
  .faded { opacity: 0.1; transition: opacity 0.2s ease; }
  .cancelled-section { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--vscode-panel-border, #404040); }
  .cancelled-header { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 500; color: var(--vscode-disabledForeground, #6b6b6b); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; padding-left: 8px; }
  .cancelled-icon { font-size: 14px; }
  .count { background: var(--vscode-badge-background, #4d4d4d); color: var(--vscode-badge-foreground, #ffffff); padding: 0 6px; border-radius: 10px; font-size: 10px; margin-left: auto; }
</style>
