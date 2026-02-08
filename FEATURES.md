# Features

## Rate Limit Detection & Auto-Restart

- [x] Detect "You've hit your limit" messages in Claude Code assistant output
- [x] Parse reset time and timezone (e.g. "10am (Europe/Zurich)") into absolute ISO timestamp
- [x] Show amber hourglass banner at the top of the board with reset time display
- [x] Badge rate-limited task cards with a pause icon (⏸) in all view modes
- [x] Auto-restart toggle: clickable link in banner + checkbox in settings panel
- [x] Schedule auto-restart timer with 30s grace period after limit resets
- [x] Send "continue" prompt to all rate-limited conversations on timer fire
- [x] VS Code notification on rate limit detection
- [x] `autoRestartAfterRateLimit` setting in VS Code configuration

## Sidechain Activity Dots

- [x] Collect sidechain step status from JSONL entries (`isSidechain: true`)
- [x] Determine step status: running (yellow), completed (green), failed (red), idle (gray)
- [x] Keep only the last 3 sidechain steps (ring buffer)
- [x] Render colored dots in TaskCard full view (meta-row, between git branch and agents)
- [x] Render colored dots in TaskCard compact view (before agent avatars)
- [x] Render single summary dot in TaskCard narrow view
- [x] Running dots pulse with 2s animation
- [x] Tooltip shows tool name on hover
