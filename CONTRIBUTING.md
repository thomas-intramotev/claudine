# Contributing to Claudine

Thanks for your interest in contributing to Claudine! This guide will help you get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [VS Code](https://code.visualstudio.com/) 1.85+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) extension installed

### Getting Started

```bash
git clone https://github.com/salam/claudine.git
cd claudine
npm install
cd webview && npm install && cd ..
```

### Building

```bash
# Build the extension (esbuild)
npm run compile

# Build the webview (Vite + Svelte)
cd webview && npm run build && cd ..
```

### Running in Development

1. Open the project in VS Code
2. Press `F5` to launch the **Extension Development Host**
3. The Claudine panel will appear in the bottom panel area

The Extension Development Host automatically excludes the extension's own workspace so development conversations don't appear on the board.

### Running Tests

```bash
npm test           # Run all tests
npx vitest --ui    # Interactive test UI
```

Tests use [Vitest](https://vitest.dev/) with mock JSONL fixtures in `src/test/fixtures/`.

### Linting

```bash
npm run lint
```

## Project Structure

```
claudine/
  src/
    constants.ts           # Named constants (timing, limits, etc.)
    extension.ts           # Extension activation & command registration
    types/index.ts         # TypeScript type definitions
    providers/
      KanbanViewProvider.ts  # Webview host & message handling
      TabManager.ts          # Tab ↔ conversation mapping & focus detection
      ClaudeCodeWatcher.ts   # File system watcher & conversation scanning
      ConversationParser.ts  # JSONL parsing & status/category detection
    services/
      StateManager.ts        # Conversation state & persistence
      StorageService.ts      # Workspace storage
      CategoryClassifier.ts  # Rule-based category classification
      ImageGenerator.ts      # AI-generated task icons
      SummaryService.ts      # AI summarization via Claude CLI
      BoardExporter.ts       # Export/import (CSV, JSON, Trello)
      CommandProcessor.ts    # Agent command processing
    test/                    # Vitest unit tests
  webview/
    src/
      App.svelte             # Root component (toolbar, search, filter)
      stores/conversations.ts # Svelte stores for state management
      components/
        KanbanBoard.svelte   # Board with drag-and-drop columns
        KanbanColumn.svelte  # Single column
        TaskCard.svelte      # Conversation card
        SettingsPanel.svelte # Settings UI
  resources/                 # Icons, templates, l10n bundles
```

## Coding Guidelines

- **TypeScript strict mode** is enabled — no `any` unless absolutely necessary
- Use named constants from `src/constants.ts` instead of magic numbers
- Follow the existing code style (no Prettier; ESLint handles formatting)
- Keep files focused — if a file grows beyond ~500 lines, consider decomposing it
- Use `vscode.l10n.t()` for all user-facing strings (i18n)
- Use `package.nls.json` for command/setting labels in `package.json`
- Prefer editing existing files over creating new ones

## Pull Request Process

1. Fork the repository and create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure `npm test` and `npm run lint` pass
4. Update `CHANGELOG.md` if your change is user-facing
5. Submit a pull request with a clear description of what and why

## Reporting Bugs

Please use the [GitHub Issues](https://github.com/salam/claudine/issues) page with the **Bug Report** template. Include:

- VS Code version
- Claudine version
- Claude Code extension version
- Steps to reproduce
- Expected vs actual behavior

## Feature Requests

Use the [GitHub Issues](https://github.com/salam/claudine/issues) page with the **Feature Request** template.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
