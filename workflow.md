# HelloCigen — Workflow Understanding (WIP)

## Goal
Build a VS Code extension with an AI agent acting as project manager for a collaborative multi-person dev session (~1 hour, 3–4 people).

---

## Key Components

### 1. Data Layer — MongoDB
- Stores session logs as JSON documents (source of truth)
- Drives the task tracker in real time

### 2. Logic Layer — extension.ts + AI Agent
- AI agent acts as project manager
- extension.ts registers commands and coordinates all components

### 3. UI Layer
- **Right panel:** AI chat window
- **Left panel:** Custom explorer + task tracker (teammate building)

---

## Participants

### Host
- Triggers session start via `initialSessionView`
- Creates VS Live Share link and shares it with teammates

### Participants
- Join via the VS Live Share link
- Must be logged into GitHub in a browser

---

## Open / TBD
- Full narrative workflow not yet complete — more details coming

---

---
## Key blockers
1. Need to figure out how concurrency will be maintained
2. How the API key will be shared? Considering security and convenience.
3. How does change in log file reflected in all particpants machine. (Most important)
---
### Complete Workflow Part by Part

#### initialSessionView — Built ✓
- **Existing Sessions table:** fetches from `GET /sessions`; columns: Project, Session Name, #, Last Updated, checkbox
- **Resume Selected:** fetches full document from `GET /sessions/:session_id`
- **Start New Session:** participant count input + start button

> **Future tasks:**
> 1. Fetched doc will drive session state (Output channel is a placeholder for now).
> 2. On resume, populate state then prompt for session name to create a new doc.
3. Session list should be scrollable within a fixed window.

#### NewSessionCreationView — Built ✓
Triggered after host clicks "Start Session".

- Calls `vsls.share()`, starts server, fetches `projects[]` from MongoDB
- Shows project cards grid with title, description, complexity badge
- Header displays **Participants Joined** counter alongside the entered count; polls every 10 s (cleared on panel dispose)
- "Begin Session" enabled only when a card is selected; validates `liveShare.peers.length + 1 === participantCount` before proceeding — shows inline error and blocks if mismatched
- POSTs to `POST /sessions` → creates `SessionLogDocument`

> **Future tasks:**
> - Close the initialSessionView
> - On resume, populate from existing doc then prompt for session name.
> - Decide if view state needs to be reflected on participant machines.
> - Highlight counter green/red depending on whether joined === expected.
> - Auto-fire a VS Code toast when a peer joins using `liveShare.onDidChangePeers`.
> - Consider auto-proceeding (with confirmation) once count matches.


#### DevelopmentView — Built ✓
Triggered automatically after `NewSessionCreationView` creates the session log.

- Calls OpenAI GPT-4 with project details + participant count → returns N divisions, maps `owner_id` by index
- PATCHes `division_of_work` onto the existing session log; displays results in panel
- If no API key set → session log created with empty `division_of_work: []`, warning shown

> **Future tasks:**
> - Show participant name alongside `owner_id` in division cards.
> - Allow re-generating division of work from within the panel.
> - Decide how session log changes are reflected on participant machines.

> **Known Issues:**
> - API key must be set manually by the host (`HELLOCIGEN: Set OpenAI API Key`).
> - GPT-4 call takes ~5s — panel shows a loading message during wait.

#### DevelopmentView — UI Layout — Built ✓
Full VS Code development layout triggered after AI task division is generated.

**Layout:** Left = Explorer + Task Tracker · Middle = editor · Right = AI Chat (`ViewColumn.Beside`)

**Task Tracker (`taskTrackerProvider.ts`):**
- Click cycles: `□ todo` → `◐ in progress` (amber) → `■ done` (green); legend pinned at top
- 3 levels: Division → Task → Subtask (subtasks optional); division status derived from children
- Task click cascades to subtasks; division click cycles all children
- Fixed height, scrollable — dynamic across any number of teammates/tasks/subtasks

> **Future tasks:**
> - Persist task status changes back to MongoDB via `PATCH /sessions/:session_id`.
> - Reflect status changes on participant machines in real time.
> - Allow collapsing/expanding individual division sections.