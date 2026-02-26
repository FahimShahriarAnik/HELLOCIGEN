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

### Complete Workflow Part by Part

#### initialSessionView — Built ✓
- **Existing Sessions table:** fetches from `GET /sessions`; columns: Project, Session Name, #, Last Updated, checkbox
- **Resume Selected:** fetches full document from `GET /sessions/:session_id`
- **Start New Session:** participant count input + start button

> **Future tasks:**
> 1. Fetched doc will drive session state (Output channel is a placeholder for now).
> 2. On resume, populate state then prompt for session name to create a new doc.

#### NewSessionCreationView — Built ✓
Triggered after host clicks "Start Session".

- Calls `vsls.share()`, starts server, fetches `projects[]` from MongoDB
- Shows project cards grid with title, description, complexity badge
- Header displays **Participants Joined** counter alongside the entered count; polls every 10 s (cleared on panel dispose)
- "Begin Session" enabled only when a card is selected; validates `liveShare.peers.length + 1 === participantCount` before proceeding — shows inline error and blocks if mismatched
- POSTs to `POST /sessions` → creates `SessionLogDocument`

> **Future tasks:**
> - On resume, populate from existing doc then prompt for session name.
> - Decide if view state needs to be reflected on participant machines.
> - Highlight counter green/red depending on whether joined === expected.
> - Auto-fire a VS Code toast when a peer joins using `liveShare.onDidChangePeers`.
> - Consider auto-proceeding (with confirmation) once count matches.
