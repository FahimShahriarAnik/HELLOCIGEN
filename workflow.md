# HelloCigen — Workflow Understanding

## Goal
Build a VS Code extension with an AI agent acting as project manager for a collaborative multi-person dev session (~1 hour, 3–4 people).

---

## Key Components

### 1. Data Layer — MongoDB
- Stores session logs as JSON documents (source of truth)
- Drives the task tracker in real time

### 2. Logic Layer — extension.ts + AI Agent
- AI agent acts as project manager
- extension.ts registers all commands and coordinates all components

### 3. UI Layer
- **Sidebar (left):** `initialSessionView` (session management) + Task Tracker
- **Main panel:** `NewSessionCreationView`, `DevelopmentView`
- **Right panel:** AI Chat (`ViewColumn.Beside`)

---

## Participants

### Host
- Triggers session start via `initialSessionView`
- Creates VS Live Share link and shares with teammates
- Detectable via `liveShare.session.role === Role.Host`

### Teammates
- Join via VS Live Share link (must be logged into GitHub)
- Detectable via `liveShare.session.role === Role.Guest`
- Should skip `initialSessionView` and land directly on development view (not yet implemented)

---

## Key Blockers
1. **Concurrency** — how real-time changes sync across machines
2. **API key sharing** — security vs. convenience tradeoff
3. **Log reflection** — how MongoDB changes are reflected on all participant machines in real time (most critical)

---

## Complete Workflow Part by Part

### initialSessionView — Built ✓
Sidebar view. Entry point for the host.

- Fetches latest **5 sessions** from `GET /sessions` (sorted by `last_updated` desc, limited server-side)
- Table columns: Project, Session Name, #, Last Updated, radio button (single select only)
- **Resume Selected:** fetches full doc from `GET /sessions/:session_id` → switches to in-progress state
- **Start New Session:** session name input + participant count input + start button

**Session In Progress state** (shown after start or resume):
- Replaces resume/start cards with a green-dot "Session in Progress" card
- Displays project title and participant count
- "Open / Close Chat" button → calls `helloCigen.toggleChat`
- State is persisted in the TS class (`activeSession`) and re-applied when the webview reinitializes (on hide/show)

> **Future tasks:**
> - On resume, prompt for a new session name and create a new session log doc (currently just shows existing doc in output channel).
> - Show teammates the development view directly, skipping this screen (use `liveShare.session.role` to branch).
> - Add "Load 5 more" / search functionality for session history.

---

### NewSessionCreationView — Built ✓
Full-panel webview. Triggered after host clicks "Start Session" in `initialSessionView`.

- Calls `vsls.share()`, starts Express server, fetches `projects[]` from MongoDB
- Shows project cards grid: title, description, complexity badge (color-coded)
- Header shows session name, expected participant count, and live **Participants Joined** counter (polls every 10s via `liveShare.peers.length + 1`)
- "Begin Session" enabled only when a card is selected
- Validates `joined === participantCount` before proceeding — shows inline error if mismatched
- On success: POSTs to `POST /sessions` → creates `SessionLogDocument` → opens `DevelopmentView` → fires `onSessionStarted` callback → `initialSessionView` switches to in-progress state

> **Future tasks (from professor feedback):**
> - Host inputs strengths and weaknesses before beginning.
> - Teammates see a separate "join" UI (not `initialSessionView`) where they input strengths/weaknesses.
> - Teammate is only registered (and the joined counter incremented) after they confirm their strengths/weaknesses.
> - Log all participant strengths/weaknesses in the session doc.
> - Highlight joined counter green/red based on whether joined === expected.
> - Auto-toast on peer join via `liveShare.onDidChangePeers`.

---

### DevelopmentView — Built ✓
Triggered automatically after `NewSessionCreationView` creates the session log.

- Shows welcome/loading state while calling OpenAI GPT-4
- GPT-4 receives project details + participant count → returns N task divisions with `owner_id` mapped by index
- PATCHes `division_of_work` onto the session log via `PATCH /sessions/:session_id`
- Displays division results in the panel
- If no API key set → session log created with empty `division_of_work: []`, warning shown

> **Known issues:**
> - API key must be set manually by the host (`HELLOCIGEN: Set OpenAI API Key`).
> - GPT-4 call takes ~5s — loading message shown during wait.

> **Future tasks (from professor feedback):**
> - Show welcome popup ("AI is dividing tasks…") while GPT-4 runs.
> - Present AI division in task tracker format, allowing host to reassign tasks between participants.
> - Show participant name alongside `owner_id` in division cards.
> - Allow re-generating division of work from within the panel.

---

### DevelopmentView — UI Layout — Built ✓
Full VS Code development layout triggered after AI task division is generated.

**Layout:** Left = Explorer + Task Tracker · Middle = editor · Right = AI Chat (`ViewColumn.Beside`)

**Task Tracker (`taskTrackerProvider.ts`):**
- Click cycles: `□ todo` → `◐ in progress` (amber) → `■ done` (green); legend pinned at top
- 3 levels: Division → Task → Subtask (subtasks optional); division status derived from children
- Task click cascades to subtasks; division click cycles all children
- Fixed height, scrollable — dynamic across any number of teammates/tasks/subtasks

> **Future tasks:**
> - Persist task status changes to MongoDB via `PATCH /sessions/:session_id`.
> - Reflect status changes on teammate machines in real time.
> - Allow collapsing/expanding individual division sections.
> - Host can reassign task ownership; teammate view reflects changes.

---

## Commands Registered

| Command | Description |
|---------|-------------|
| `helloCigen.start` | Legacy: starts Live Share + logs session (pre-UI flow) |
| `helloCigen.openChat` | Opens AI chat panel (reveals if already open) |
| `helloCigen.toggleChat` | Opens or closes AI chat panel |
| `helloCigen.setApiKey` | Stores OpenAI API key in VS Code secrets |
| `helloCigen.clearApiKey` | Removes stored OpenAI API key |
| `helloCigen.sendActiveFile` | Sends active editor file into chat context |

---

## Immediate Next Steps
1. Test VSIX on two machines — how much syncs out of the box?
2. Fetch an active session from MongoDB and reflect its live state in the UI.
3. Implement host vs. guest branching using `liveShare.session.role`.
4. Build teammate onboarding flow (strengths/weaknesses input, skip `initialSessionView`).
