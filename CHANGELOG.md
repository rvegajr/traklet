# Changelog

## 0.1.0 (2026-03-20)

Initial release.

### Features

- **Widget** - Floating, draggable panel that snaps to screen edges and resizes as a sidebar
- **Backends** - Azure DevOps, GitHub Issues, generic REST API, and localStorage adapters
- **Test Case Management** - Structured test cases with sections (Objective, Steps, Expected Result, etc.)
- **Test Runs** - Named test sessions with pass/fail/blocked tracking and run history
- **CLI** - `npx traklet sync` seeds test cases from `.traklet/` markdown files with dependency ordering
- **Jam.dev Integration** - Paste recording links into evidence sections
- **Screenshot Paste** - Ctrl+V images into editable sections
- **Markdown Rendering** - Bold, italic, lists, links, code, and images rendered inline
- **8 Color Themes** - Ocean, Purple, Sunset, Teal, Pink, Orange, Lime, Slate + dark mode
- **Auto-mount** - `Traklet.init()` creates and mounts the widget automatically
- **Shadow DOM Isolation** - Zero CSS interference with host application
- **User Identity** - Auto-detected from backend via PAT token, persisted in IndexedDB
- **Offline Queue** - Operations queued when offline, synced on reconnect
- **Diagnostics** - Console logs, JS errors, performance metrics, recording sessions
- **Comments** - Full thread with add/edit/delete per issue
- **CRUD** - Create, edit, delete issues through the UI with form validation

### Adapters

- `azure-devops` - Azure DevOps Work Items REST API v7.0
- `github` - GitHub Issues REST API v3
- `rest` - Generic REST API with configurable base URL
- `localStorage` - In-memory with optional localStorage persistence

### Security

- `.traklet/settings.json` gitignored by default
- Pre-commit hook blocks accidental token commits
- Runtime warning for hardcoded tokens
- Shared PAT + individual identity model for UAT deployments

### Testing

- 688 unit tests (91%+ coverage)
- 19+ E2E tests (Playwright)
- Live Azure DevOps integration tests verified
- Adapter contract test suite for ISP compliance
