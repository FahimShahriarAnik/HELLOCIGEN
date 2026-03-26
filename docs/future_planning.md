# HelloCigen — Implementation Plan

**Created:** 2026-03-26
**Base branch:** `claude_playground`
**Reference:** [testing-issues-triage-2026-03-26.md](testing-issues-triage-2026-03-26.md)

---

## Branching Strategy

```
claude_playground
  └── phase-1-guest-sync
        └── phase-2-session-robustness
              └── phase-3-polish
```

Each phase produces a `.vsix` for testing. If Phase N fails testing, roll back to Phase N-1 VSIX.

---

## Phase 1: Guest State Sync & Participant Tracking ✅ COMPLETED

**Branch:** `phase-1-guest-sync` (checkout from `claude_playground`)
**Issues addressed:** 6, 8, 9, 10
**Status:** Implemented and compiled. VSIX built successfully.

### 1.1 — Session State Machine on Server ✅

- Added `SessionStatus` type (`"draft" | "dividing" | "active" | "completed"`) and `status` field to `SessionLogDocument` in `src/models/sessionLog.ts`
- Added in-memory `sessionStates` map (`Map<string, SessionState>`) in `src/server/server.ts`
- New endpoint: `GET /sessions/:liveShareSessionId/state` — returns current session status + division data when `"active"`
- `POST /sessions` sets state to `"dividing"` on creation
- `PATCH /sessions/:session_id` transitions to `"active"` when `division_of_work` is patched

### 1.2 — Guest Polling & View Transitions ✅

- `src/ui/guestOnboardingView.ts` — polls `GET /sessions/:id/state` every 5 seconds after profile submission
- On `"active"` state: stops polling, populates TaskTracker, disposes onboarding panel, opens `GuestDevelopmentView`
- New file: `src/ui/guestDevelopmentView.ts` — card grid showing all divisions, guest's own highlighted; focuses TaskTracker sidebar

### 1.3 — Push Division Data to Guest Task Tracker ✅

- Reuses existing `TaskTrackerProvider.instance` singleton (no duplicate code)
- `guestDevelopmentView.ts` calls `setDivisions()` and `setParticipants()` with data from state endpoint
- `guestOnboardingView.ts` also populates TaskTracker on state transition

### 1.4 — Fix Participant Identification ✅

- Guest onboarding form has required "Your Name" field, pre-filled from VSLS `displayName`
- `peerNumber` used as stable matching key (host = 1, guests = `p.peerNumber ?? idx + 2`)
- Server merges pending guest S&W into session doc by `peerNumber` match
- Fallback IDs aligned: host `'u1'` ↔ peerNumber 1, guest `'u{n}'` ↔ peerNumber n

### 1.5 — Verification

- [x] Start a session as host, join as 2+ guests
- [x] Guests submit profiles with custom display names
- [x] Host sees correct participant count with real names
- [x] Host clicks "Begin Session" → divisions generated
- [x] Host confirms divisions → guests automatically transition from waiting to development view
- [x] Guests see their assigned tasks in TaskTracker sidebar
- [x] MongoDB doc has correct participant names (not u1/u2)
- [x] Build VSIX: `npx vsce package`

---

## Phase 2: Session Robustness & Pre-flight ✅ COMPLETED

**Branch:** `phase-2-session-robustness` (checkout from `phase-1-guest-sync`)
**Issues addressed:** 1, 4, 5, 7
**Status:** Implemented and compiled. Ready for testing.

### 2.1 — Early MongoDB Document Creation ✅

- Added `createDraftSession()` in `src/utils/session_log_utils.ts` — POSTs a minimal doc with `status: "draft"`, session name, start time, empty participants
- Added `beginSessionDividing()` in `src/utils/session_log_utils.ts` — builds participant list from Live Share peers, PATCHes draft → `"dividing"`
- `src/ui/initialSessionView.ts` calls `createDraftSession()` immediately after Live Share + server start
- `src/ui/newSessionCreationView.ts` now PATCHes the existing draft (via `beginSessionDividing`) instead of POSTing a new doc
- `src/server/server.ts` `POST /sessions` respects `status: "draft"` (skips pending-participant merge, sets state to `"draft"`)
- `src/server/server.ts` `PATCH /sessions/:id` merges pending guest S&W when transitioning to `"dividing"`

### 2.2 — Server Reliability ✅

- `src/serverManager.ts`: auto-restart on unexpected exit (up to 3 attempts, 2s delay), EADDRINUSE detection with specific error message, `restartServer()` public method, `intentionallyStopped` flag to distinguish intentional vs crash exits
- `src/ui/initialSessionView.ts`: `shareServer()` failure now shows `showWarningMessage`
- `src/extension.ts`: registered `helloCigen.restartServer` command
- `package.json`: added `helloCigen.restartServer` to `contributes.commands`
- `src/server/server.ts`: try/catch added to all Express route handlers (pending-participants POST/GET)

### 2.3 — API Key Pre-flight Check ✅

- `src/extension.ts` `activate()`: auto-dismissing 10s notification via `withProgress` when API key is found at activation
- `src/extension.ts` `helloCigen.start`: checks secrets + `process.env.OPENAI_API_KEY` fallback, auto-stores env var in secrets, shows warning with "Set API Key" button if missing
- `src/ui/initialSessionView.ts` `startSession()`: same API key check applied to the primary session creation flow

### 2.4 — Folder Validation Guard ✅

- `src/extension.ts` `helloCigen.start`: guard at top returns early with error message if no workspace folder open
- `src/ui/initialSessionView.ts` `startSession()`: same guard applied to the primary flow

### 2.5 — Verification

- [ ] Create session → MongoDB doc created immediately with `status: "draft"`
- [ ] Participants join → doc patched incrementally
- [ ] Host confirms → status transitions through `dividing` → `active`
- [ ] Kill server process manually → extension auto-restarts it
- [ ] Start session with port 4000 in use → clear error message
- [ ] Extension activates with API key → auto-dismissing "API key found" notification (10s)
- [ ] Extension activates without API key → no notification
- [ ] Start session without API key → warning with "Set API Key" button
- [ ] Try to create session without open folder → error message
- [ ] Build VSIX: `npx vsce package`

---

## Phase 3: Polish & Persistence

**Branch:** `phase-3-polish` (checkout from `phase-2-session-robustness`)
**Issues addressed:** 11, 2, 3

### 3.1 — Chat History Persistence

**Goal:** Persist chat messages to MongoDB session doc.

**Files to modify:**
- `src/models/sessionLog.ts` — add `chat_history` field
- `src/ui/chatManager2.ts` — save messages to server after each exchange
- `src/ui/devChatPanel.ts` — same persistence logic
- `src/server/server.ts` — accept chat history in PATCH endpoint

**Implementation:**
- Add to `SessionLogDocument`:
  ```typescript
  chat_history?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    participant_name?: string;
    timestamp: string;
  }>;
  ```
- After each message exchange in `chatManager2` and `devChatPanel`:
  - `PATCH /sessions/:id` with `{ $push: { chat_history: newMessage } }`
- On panel open, load existing chat history from the session doc if available

### 3.2 — Document Live Share Guest Approval Setting

**Goal:** Help hosts control who can join.

**Files to create:**
- Update extension README or create a setup guide section

**Implementation:**
- Add a note in the session creation UI (tooltip or info text): "To require approval for joining guests, enable `liveshare.guestApprovalRequired` in VS Code settings"
- No code change needed — just UI guidance

### 3.3 — Dual Participant Counter (Optional)

**Goal:** Show "Connected: X | Confirmed: Y" in host's session creation view.

**Files to modify:**
- `src/ui/newSessionCreationView.ts` — add connected count from Live Share peers

**Implementation:**
- In the polling interval, also read `liveShare.peers.length` for connected count
- Update UI to show both numbers: "Connected: 3 | Confirmed: 2"
- Helps host know who's connected but hasn't submitted profile yet

### 3.4 — Verification

- [ ] Open chat, send messages, close panel, reopen → history loaded from MongoDB
- [ ] Check MongoDB doc → `chat_history` array populated with timestamps
- [ ] Host sees "Connected: X | Confirmed: Y" during session setup
- [ ] Build VSIX: `npx vsce package`

---

## Notes

- **Phase 1 is complete** — guest state sync, polling, view transitions, and participant identification all implemented
- **Phase 2 is complete** — early draft doc creation, server auto-restart, API key pre-flight, folder guard all implemented
- Each phase must compile and produce a working VSIX before moving to the next
- The `status` field is now persisted to MongoDB from doc creation (`"draft"` → `"dividing"` → `"active"`)
- The `initialSessionView` flow now creates a draft doc immediately; `newSessionCreationView` PATCHes it to `"dividing"` (no longer POSTs a new doc)
- The legacy `helloCigen.start` command flow still uses the old `createSessionLog` POST path
- All OpenAI API calls are host-only; guests never need the key
- `peerNumber` is the stable unique key for participant matching (replaces nullable `userId`)
- Chat history must be synced across all participants (not just persisted) — when Phase 1 guest sync is in place, chat sync should piggyback on the same state mechanism
- Auto-dismissing notifications pattern (`withProgress` + timeout) is now used for the API key found notification; can be applied to other informational popups as needed
