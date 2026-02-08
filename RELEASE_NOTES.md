# Release Notes

## Version 1.0.4 (Feb 8 2026, 12:00)

* Rate limit detection — automatically detects when Claude Code hits its API limit and shows the reset time
* Amber hourglass banner at the top of the board with "resets at X" display
* Pause badge (⏸) on all rate-limited task cards (full, compact, and narrow views)
* Auto-restart option — when enabled, paused tasks automatically resume after the rate limit resets (+ 30s grace)
* Auto-restart toggle available in the banner and the settings panel

## Version 1.0.3 (Feb 8 2026, 09:21)

* Added sidechain activity dots — small colored dots show the last 3 subagent steps (gray=idle, green=completed, red=failed, yellow=running)
* Fixed ghost "Untitled Conversation" cards caused by Claude Code sidechain messages leaking into the board
* Fixed tasks from other projects appearing — only conversations from the currently opened workspace are shown now
* Empty conversations with no meaningful content are no longer displayed
