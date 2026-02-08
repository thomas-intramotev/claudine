# Bugfixes

## BUG1 — Ghost "Untitled Conversation" tasks
- **Reported:** 2026-02-08
- **Symptom:** Random "Untitled Conversation" cards appear on the board that seem to be fragments or steps from other conversations.
- **Root cause:** `parseLines()` does not filter out JSONL entries where `isSidechain: true`. Sidechain entries (branched sub-conversations within Claude Code) are included in the parsed messages, producing ghost conversations with no real user content.
- [✔️] Fixed

## BUG2 — Tasks from other projects appear on the board
- **Reported:** 2026-02-08
- **Symptom:** Conversations from projects other than the currently opened workspace show up on the Kanban board.
- **Root cause:** The file system watcher in `ClaudeCodeWatcher.startWatching()` watches `**/*.jsonl` across ALL project directories. The `onFileChanged` callback processes any changed file without checking whether it belongs to the current workspace. While the initial `scanForConversations()` correctly filters via `getProjectDirsToScan()`, real-time file-change events bypass that filter.
- [✔️] Fixed

## BUG3 — Empty conversations shown on the board
- **Reported:** 2026-02-08
- **Symptom:** Empty cards appear with title "Untitled Conversation", no description, and "No messages" — providing no useful information.
- **Root cause:** `ConversationParser.parseFile()` returns a `Conversation` object even when the conversation has no meaningful content (title is "Untitled Conversation", description and lastMessage are both empty). There is no minimum-content gate.
- [✔️] Fixed
