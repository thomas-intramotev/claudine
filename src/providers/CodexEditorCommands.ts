/**
 * Editor commands for OpenAI Codex.
 *
 * The Codex VS Code extension (`openai.chatgpt`) exposes `chatgpt.openSidebar`
 * to focus its sidebar panel. We use that as the primary way to "open" a Codex
 * conversation, falling back to opening the session JSONL file only if the
 * command is unavailable.
 */

import * as vscode from 'vscode';
import { IEditorCommands } from './IEditorCommands';
import { StateManager } from '../services/StateManager';

/** The command registered by the Codex VS Code extension to focus its sidebar. */
const CODEX_OPEN_SIDEBAR_CMD = 'chatgpt.openSidebar';

export class CodexEditorCommands implements IEditorCommands {

  constructor(private readonly _stateManager: StateManager) {}

  async openConversation(conversationId: string): Promise<boolean> {
    // BUG23b: Try to open the Codex sidebar panel first. The Codex extension
    // doesn't expose a command to open a *specific* conversation, but focusing
    // the sidebar is far more useful than opening the raw JSONL file.
    try {
      await vscode.commands.executeCommand(CODEX_OPEN_SIDEBAR_CMD);
      return true;
    } catch {
      // Command not available — Codex extension may not be installed.
    }

    // Fallback: open the session file in the editor.
    const conv = this._stateManager.getConversation(conversationId);
    if (!conv?.filePath) {
      return false;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(conv.filePath);
      await vscode.window.showTextDocument(doc, { preview: false });
      return true;
    } catch {
      return false;
    }
  }

  async sendPrompt(_conversationId: string, _prompt: string): Promise<boolean> {
    return false;
  }

  async startNewConversation(_prompt: string): Promise<boolean> {
    return false;
  }

  async focusEditor(): Promise<boolean> {
    // Try to focus the Codex sidebar
    try {
      await vscode.commands.executeCommand(CODEX_OPEN_SIDEBAR_CMD);
      return true;
    } catch {
      return false;
    }
  }

  interruptTerminals(): void {
    // No-op — Codex terminal detection not implemented yet
  }
}
