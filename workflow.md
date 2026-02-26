# HelloCigen — Workflow Understanding (WIP)

## Goal
Build a VS Code extension with an AI agent acting as project manager for a collaborative multi-person dev session (~1 hour, 3–4 people).

---

## Key Components

### 1. Data Layer — MongoDB
- Stores session logs as JSON documents
- Session log = source of truth for all session-related data
- Used to keep the task tracker updated in real time

### 2. Logic Layer — extension.ts + AI Agent
- AI agent acts as project manager
- extension.ts needs updates to support this role

### 3. UI Layer
- **Right panel:** AI chat window
- **Left panel:** Custom explorer + task tracker
- Teammate is building the left panel; some UI already exists

---

## Participants

### Host
- Triggers session start via `initialSessionView`
- Creates VS Live Share link and shares it with teammates

### Participants
- Join via the VS Live Share link
- Must be logged into GitHub in a browser to join with their GitHub username

---

## Open / TBD
- Full narrative workflow not yet complete — more details coming


### Complete Workflow Part by Part
#### initialSessionView — Built ✓
- **Existing Sessions table** (5 columns): Project | Session Name | # | Last Updated | checkbox
  - Data fetched from `GET /sessions` via MongoDB aggregation (latest session_number per session_id)
  - Fields returned: `project_title`, `session_name`, `session_number`, `last_updated`, `session_id` (hidden)
- **Resume Selected** button: reads the checked row's `session_id`, fetches full document from `GET /sessions/:session_id`
- **Start New Session** card: participant count input + start button (unchanged)

> **Future task:**
1. `SessionLogDocument` output to **HelloCigen** Output channel is a placeholder; fetched doc will drive session state in future.
2. Window is not moveable or resizeable.
3. On resume, fetch existing doc, populate state, then prompt for session name to create a new doc.

#### NewSessionCreationView — Built ✓
Triggered after host clicks "Start Session" in `initialSessionView`.

**Flow:**
- `initialSessionView.startSession()` calls `vsls.share()` → Live Share link is generated
- Server starts, fetches `GET /project_details` → extracts `projects[]` from MongoDB `projectConfigs`
- Opens `NewSessionCreationView` (new `WebviewPanel`) passing `sessionName`, `participantCount`, `projects`

**UI (`src/ui/newSessionCreationView.ts`):**
- Header shows session name + participant count
- Project cards grid — each card shows `title`, `description`, complexity badge (green/yellow/red)
- Clicking a card selects it (highlighted border)
- "Begin Session" button enabled only when a card is selected

**On "Begin Session":**
- Reads `liveShare.session.id` as `sessionId`
- Calls `createSessionLog({ sessionId, sessionName, firstProject: selectedProject, liveShare, sessionNumber: 1 })`
- POSTs to `POST /sessions` → creates `SessionLogDocument` in MongoDB with `session_name` populated
- Shows success notification → panel closes

**Files changed:**
- `src/ui/newSessionCreationView.ts` — created
- `src/ui/initialSessionView.ts` — `startSession()` now fetches projects + opens `NewSessionCreationView`; accepts `context` in constructor
- `src/utils/session_log_utils.ts` — added `sessionName?: string` to `CreateSessionParams`; `session_name` now stored in session log document
- `src/extension.ts` — passes `context` to `InitialSessionView` constructor

> **Future task:**
> - On resume, fetch existing doc, populate state, then prompt for session name to create a new doc.
> - Decide if `NewSessionCreationView` state needs to be reflected on participant machines via Live Share.