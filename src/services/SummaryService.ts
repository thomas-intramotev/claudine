import * as vscode from 'vscode';
import * as os from 'os';
import { spawn } from 'child_process';
import { Conversation } from '../types';

interface CachedSummary {
  title: string;
  description: string;
  lastMessage: string;
}

export class SummaryService {
  private _cache: Record<string, CachedSummary> = {};
  private _pending = new Set<string>();
  private _claudeAvailable: boolean | undefined;
  private _context: vscode.ExtensionContext | undefined;

  public init(context: vscode.ExtensionContext) {
    this._context = context;
    this._cache = context.globalState.get<Record<string, CachedSummary>>('summaryCache', {});
  }

  /** Apply cached summary to a conversation. Returns true if cache hit. */
  public applyCached(conversation: Conversation): boolean {
    const cached = this._cache[conversation.id];
    if (!cached) return false;
    conversation.originalTitle = conversation.title;
    conversation.originalDescription = conversation.description;
    conversation.title = cached.title;
    conversation.description = cached.description;
    conversation.lastMessage = cached.lastMessage;
    return true;
  }

  /** Check whether a conversation already has a cached summary. */
  public hasCached(id: string): boolean {
    return id in this._cache;
  }

  /**
   * Summarize uncached conversations via the Claude Code CLI.
   * Fire-and-forget: calls onUpdate for each completed summary.
   */
  public summarizeUncached(
    conversations: Conversation[],
    onUpdate: (id: string, summary: CachedSummary) => void
  ): void {
    // Check setting
    const enabled = vscode.workspace.getConfiguration('claudine').get<boolean>('enableSummarization', false);
    if (!enabled) return;

    const uncached = conversations.filter(c => !this._cache[c.id] && !this._pending.has(c.id));
    if (uncached.length === 0) return;

    for (const c of uncached) this._pending.add(c.id);

    this.processBatches(uncached, onUpdate).catch(error => {
      console.error('Claudine: Summarization failed', error);
    });
  }

  private async processBatches(
    conversations: Conversation[],
    onUpdate: (id: string, summary: CachedSummary) => void
  ): Promise<void> {
    if (this._claudeAvailable === undefined) {
      this._claudeAvailable = await this.checkClaudeAvailable();
    }
    if (!this._claudeAvailable) {
      for (const c of conversations) this._pending.delete(c.id);
      return;
    }

    for (let i = 0; i < conversations.length; i += 10) {
      const batch = conversations.slice(i, i + 10);
      try {
        const summaries = await this.callClaude(batch);
        for (let j = 0; j < batch.length && j < summaries.length; j++) {
          const conv = batch[j];
          const raw = summaries[j];
          if (raw) {
            const summary: CachedSummary = {
              title: raw.title || conv.title,
              description: raw.description || conv.description,
              lastMessage: raw.lastMessage || conv.lastMessage
            };
            this._cache[conv.id] = summary;
            this._pending.delete(conv.id);
            onUpdate(conv.id, summary);
          }
        }
        this.saveCache();
      } catch (error) {
        console.error('Claudine: Summarization batch failed', error);
        for (const c of batch) this._pending.delete(c.id);
      }
    }
  }

  private callClaude(
    conversations: Conversation[]
  ): Promise<Array<{ title?: string; description?: string; lastMessage?: string }>> {
    return new Promise((resolve, reject) => {
      const entries = conversations.map((c, i) =>
        `${i + 1}.\n  title: ${c.title.slice(0, 100)}\n  desc: ${c.description.slice(0, 200)}\n  latest: ${c.lastMessage.slice(0, 200)}`
      ).join('\n\n');

      const prompt = `Summarize these coding conversations for compact Kanban board cards.
Rules per entry:
- title: max 8 words, imperative style (e.g. "Fix login page auth bug")
- description: 1 sentence, max 15 words
- lastMessage: keep as-is or shorten to 1 line

${entries}

Return ONLY a JSON array in the same order: [{"title":"...","description":"...","lastMessage":"..."}]`;

      let stdout = '';
      let stderr = '';

      // Use spawn with shell:true so the user's PATH is resolved correctly
      // (VS Code extensions don't inherit shell PATH on macOS).
      // Pipe prompt via stdin to avoid argument length limits.
      const child = spawn('claude', ['-p'], {
        shell: true,
        cwd: os.tmpdir(),
        timeout: 60000,
        env: { ...process.env }
      });

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      child.on('error', (err) => reject(err));

      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`claude exited with code ${code}: ${stderr}`));
        }
        try {
          const match = stdout.match(/\[[\s\S]*\]/);
          if (!match) return reject(new Error(`No JSON array in Claude response: ${stdout.slice(0, 200)}`));
          resolve(JSON.parse(match[0]));
        } catch (e) {
          reject(e);
        }
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  private checkClaudeAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('claude', ['--version'], { shell: true, timeout: 5000 });
      child.on('error', () => {
        console.log('Claudine: Claude CLI not available, skipping summarization');
        resolve(false);
      });
      child.on('close', (code) => {
        if (code !== 0) {
          console.log('Claudine: Claude CLI not available, skipping summarization');
        }
        resolve(code === 0);
      });
    });
  }

  private saveCache() {
    this._context?.globalState.update('summaryCache', this._cache);
  }
}
