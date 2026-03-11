<script lang="ts">
  import { vscode } from '../lib/vscode';
  import { settings } from '../stores/conversations';

  export let visible = false;

  let apiKeyValue = '';
  let saved = false;
  let testing = false;
  let testResult: 'success' | 'error' | null = null;
  let pendingBrowseAction: 'set-single' | 'add-multi' | null = null;

  function updateSetting(key: string, value: unknown) {
    vscode.postMessage({ type: 'updateSetting', key, value });
  }

  function testConnection() {
    testing = true;
    testResult = null;
    vscode.postMessage({ type: 'testApiConnection' });
  }

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

  import { onMount, onDestroy } from 'svelte';
  onMount(() => window.addEventListener('message', handleMessage));
  onDestroy(() => window.removeEventListener('message', handleMessage));

  function handleApiChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    updateSetting('imageGenerationApi', val);
    apiKeyValue = '';
    saved = false;
  }

  function saveApiKey() {
    if (!apiKeyValue.trim()) return;
    updateSetting('imageGenerationApiKey', apiKeyValue.trim());
    saved = true;
    setTimeout(() => { saved = false; }, 2000);
  }

  function handleKeyKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') saveApiKey();
  }

  function regenerateIcons() {
    vscode.postMessage({ type: 'regenerateIcons' });
  }

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
        paths: current.paths.filter((p: string) => p !== pathToRemove)
      });
    }
  }

  function formatPath(p: string): string {
    const parts = p.split('/');
    if (parts.length > 3) {
      return '\u2026/' + parts.slice(-2).join('/');
    }
    return p;
  }
</script>

{#if visible}
  <div class="settings-panel">
    <div class="settings-header">
      <span>Settings</span>
    </div>

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
          {$settings.monitoredWorkspace.path ? 'Change\u2026' : 'Browse\u2026'}
        </button>
      </div>
    {:else if $settings.monitoredWorkspace.mode === 'multi'}
      <div class="workspace-info">
        {#if $settings.monitoredWorkspace.paths && $settings.monitoredWorkspace.paths.length > 0}
          {#each $settings.monitoredWorkspace.paths as wsPath}
            <span class="path-chip removable" title={wsPath}>
              {formatPath(wsPath)}
              <button class="remove-path" on:click={() => removeMonitoredPath(wsPath)}>&#10005;</button>
            </span>
          {/each}
        {:else}
          <span class="path-hint">No paths configured</span>
        {/if}
        <button class="browse-btn" on:click={() => browseFolder('add-multi')}>Add path&hellip;</button>
      </div>
    {/if}

    <label class="field">
      <span class="field-label">Image Generation</span>
      <select value={$settings.imageGenerationApi} on:change={handleApiChange}>
        <option value="none">None</option>
        <option value="openai">OpenAI (DALL-E 3)</option>
        <option value="stability">Stability AI</option>
      </select>
    </label>

    {#if $settings.imageGenerationApi !== 'none'}
      <div class="field">
        <span class="field-label">API Key</span>
        <div class="key-row">
          <input
            type="password"
            bind:value={apiKeyValue}
            on:keydown={handleKeyKeydown}
            placeholder={$settings.hasApiKey ? '••••••••  (key saved)' : 'sk-...'}
          />
          <button class="save-btn" class:saved on:click={saveApiKey}>
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
        <div class="key-actions">
          <span class="field-hint">
            {#if $settings.imageGenerationApi === 'openai'}
              From platform.openai.com
            {:else}
              From platform.stability.ai
            {/if}
          </span>
          {#if $settings.hasApiKey}
            <button
              class="test-btn"
              class:testing
              class:success={testResult === 'success'}
              class:error={testResult === 'error'}
              on:click={testConnection}
              disabled={testing}
            >
              {#if testing}
                Testing...
              {:else if testResult === 'success'}
                Connected
              {:else if testResult === 'error'}
                Failed
              {:else}
                Test Connection
              {/if}
            </button>
          {/if}
        </div>
      </div>
    {/if}

    <div class="field">
      <span class="field-label">Toolbar Location</span>
      <select value={$settings.toolbarLocation} on:change={(e) => updateSetting('toolbarLocation', e.currentTarget.value)}>
        <option value="sidebar">Sidebar</option>
        <option value="titlebar">Title bar</option>
      </select>
    </div>

    <label class="toggle-field">
      <input
        type="checkbox"
        checked={$settings.autoRestartAfterRateLimit}
        on:change={(e) => updateSetting('autoRestartAfterRateLimit', e.currentTarget.checked)}
      />
      <span class="toggle-label">Auto-restart after rate limit</span>
    </label>

    <div class="field">
      <span class="field-label">Card Layout</span>
      <div class="toggle-group">
        <label class="toggle-field">
          <input type="checkbox" checked={$settings.showTaskIcon} on:change={(e) => updateSetting('showTaskIcon', e.currentTarget.checked)} />
          <span class="toggle-label">Icon</span>
        </label>
        <label class="toggle-field">
          <input type="checkbox" checked={$settings.showTaskDescription} on:change={(e) => updateSetting('showTaskDescription', e.currentTarget.checked)} />
          <span class="toggle-label">Description</span>
        </label>
        <label class="toggle-field">
          <input type="checkbox" checked={$settings.showTaskLatest} on:change={(e) => updateSetting('showTaskLatest', e.currentTarget.checked)} />
          <span class="toggle-label">Latest message</span>
        </label>
        <label class="toggle-field">
          <input type="checkbox" checked={$settings.showTaskGitBranch} on:change={(e) => updateSetting('showTaskGitBranch', e.currentTarget.checked)} />
          <span class="toggle-label">Git branch</span>
        </label>
      </div>
    </div>

    <button class="regen-btn" on:click={regenerateIcons}>Regenerate Thumbnails</button>
  </div>
{/if}

<style>
  .settings-panel {
    padding: 8px 12px;
    background: var(--vscode-sideBar-background, #252526);
    border-bottom: 1px solid var(--vscode-panel-border, #404040);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .settings-header {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .field-label {
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
  }
  .field select,
  .field input {
    background: var(--vscode-input-background, #3c3c3c);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 3px;
    padding: 4px 8px;
    color: var(--vscode-input-foreground, #cccccc);
    font-size: 11px;
    font-family: inherit;
    outline: none;
  }
  .field select:focus,
  .field input:focus {
    border-color: var(--vscode-focusBorder, #007acc);
  }
  .key-row {
    display: flex;
    gap: 4px;
  }
  .key-row input { flex: 1; min-width: 0; }
  .save-btn {
    padding: 4px 10px;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border, #404040);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #cccccc);
    font-size: 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  .save-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .save-btn.saved {
    background: var(--vscode-testing-iconPassed, #10b981);
    color: #fff;
    border-color: transparent;
  }
  .field-hint {
    font-size: 9px;
    color: var(--vscode-descriptionForeground, #8c8c8c);
    opacity: 0.8;
  }
  .key-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .test-btn {
    padding: 3px 8px;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border, #404040);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #cccccc);
    font-size: 9px;
    cursor: pointer;
    white-space: nowrap;
  }
  .test-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .test-btn:disabled { opacity: 0.6; cursor: default; }
  .test-btn.success {
    background: var(--vscode-testing-iconPassed, #10b981);
    color: #fff;
    border-color: transparent;
  }
  .test-btn.error {
    background: var(--vscode-testing-iconFailed, #ef4444);
    color: #fff;
    border-color: transparent;
  }
  .toggle-field {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .toggle-field input[type="checkbox"] {
    accent-color: var(--vscode-focusBorder, #007acc);
    cursor: pointer;
  }
  .toggle-label {
    font-size: 10px;
    color: var(--vscode-foreground, #cccccc);
  }
  .toggle-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 2px;
  }
  .regen-btn {
    padding: 4px 10px;
    border-radius: 3px;
    border: 1px solid var(--vscode-panel-border, #404040);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #cccccc);
    font-size: 10px;
    cursor: pointer;
    align-self: flex-start;
  }
  .regen-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }

  /* Monitored Workspace */
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
</style>
