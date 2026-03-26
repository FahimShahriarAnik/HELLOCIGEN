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

## Phase 1: Guest State Sync & Participant Tracking

**Branch:** `phase-1-guest-sync` (checkout from `claude_playground`)
**Issues addressed:** 6, 8, 9, 10

### 1.1 — Session State Machine on Server

**Goal:** Server tracks session lifecycle so guests can poll for state transitions.

**Files to modify:**
- `src/server/server.ts` — add session state tracking
- `src/models/sessionLog.ts` — add `status` field to `SessionLogDocument`

**Implementation:**
- Add a `status` field to `SessionLogDocument`: `"draft" | "dividing" | "active" | "completed"`
- Add an in-memory `sessionStates` map on the server: `Map<string, { status: string, division_of_work?: Division[] }>`
- New endpoint: `GET /sessions/:liveShareSessionId/state` — returns current session status and division data if status is `"active"`
- Update `POST /sessions` to set state to `"dividing"` when session is created
- Update `PATCH /sessions/:id` (when divisions confirmed) to set state to `"active"` and store divisions in the state map

### 1.2 — Guest Polling & View Transitions

**Goal:** Guests poll for state changes and transition from waiting screen to development view.

**Files to modify:**
- `src/ui/guestOnboardingView.ts` — add polling after profile submission
- New file: `src/ui/guestDevelopmentView.ts` — guest's post-division view (shows assigned tasks)

**Implementation:**
- After guest submits profile and sees "Waiting for host...", start polling `GET /sessions/:sessionId/state` every 5 seconds
- When state transitions to `"active"`:
  - Stop polling
  - Fetch division data from the state response
  - Dispose the onboarding webview
  - Open `guestDevelopmentView` showing the guest's assigned tasks
- `guestDevelopmentView` should:
  - Display the guest's division (filtered by their participant name)
  - Show a task checklist they can interact with
  - Include a chat panel (DevChatPanel) if API key is available (optional for guests)

### 1.3 — Push Division Data to Guest Task Tracker

**Goal:** TaskTrackerProvider sidebar works for both host and guests.

**Files to modify:**
- `src/ui/taskTrackerProvider.ts` — make it work from fetched data, not just host-side calls
- `src/ui/divisionReviewPanel.ts` — ensure confirmed divisions are stored in server state

**Implementation:**
- When host confirms divisions in `DivisionReviewPanel`:
  - `PATCH /sessions/:id` saves divisions to MongoDB (already works)
  - Also update the in-memory `sessionStates` map with divisions and set status to `"active"`
- On the guest side, after state transition to `"active"`:
  - Call `TaskTrackerProvider.instance?.setDivisions(divisions)` with data from the state endpoint
  - Call `TaskTrackerProvider.instance?.setParticipants(participants)` with participant list

### 1.4 — Fix Participant Identification

**Goal:** Every participant has a real name, matched reliably.

**Files to modify:**
- `src/ui/guestOnboardingView.ts` — add required "Your Name" field, pre-filled from VSLS
- `src/server/server.ts` — use `peerNumber` as matching key instead of `userId`
- `src/utils/session_log_utils.ts` — pass `peerNumber` as stable ID

**Implementation:**
- In `guestOnboardingView.ts`:
  - Add a **required** text input "Your Name" to the HTML form
  - Pre-fill with `liveShare.session?.user?.displayName` if available
  - Guest can edit it
  - Send `peerNumber` alongside `userId` and `displayName` to `POST /pending-participants`
- In `server.ts` POST `/pending-participants`:
  - Store keyed by `peerNumber` (always unique per session) instead of `userId`
- In `session_log_utils.ts`:
  - Include `peerNumber` in the participant object sent to `POST /sessions`
- In `server.ts` POST `/sessions` merge logic:
  - Match by `peerNumber` instead of `userId`
  - Always use the self-reported `displayName` from pending data

### 1.5 — Verification

- [ ] Start a session as host, join as 2+ guests
- [ ] Guests submit profiles with custom display names
- [ ] Host sees correct participant count with real names
- [ ] Host clicks "Begin Session" → divisions generated
- [ ] Host confirms divisions → guests automatically transition from waiting to development view
- [ ] Guests see their assigned tasks in TaskTracker sidebar
- [ ] MongoDB doc has correct participant names (not u1/u2)
- [ ] Build VSIX: `npx vsce package`

---

## Phase 2: Session Robustness & Pre-flight

**Branch:** `phase-2-session-robustness` (checkout from `phase-1-guest-sync`)
**Issues addressed:** 1, 4, 5, 7

### 2.1 — Early MongoDB Document Creation

**Goal:** Create session doc when session name is entered, patch incrementally.

**Files to modify:**
- `src/models/sessionLog.ts` — add `status` field to the TypeScript interface
- `src/ui/initialSessionView.ts` or `src/ui/newSessionCreationView.ts` — create doc on session name entry
- `src/server/server.ts` — ensure `POST /sessions` supports creating a draft doc
- `src/utils/session_log_utils.ts` — update `createSessionLog` to support draft creation

**Implementation:**
- Add `status: "draft" | "dividing" | "active" | "completed"` to `SessionLogDocument`
- When user enters session name and clicks next:
  - `POST /sessions` creates a doc with `status: "draft"`, session name, start time, and empty participants
- As participants join and submit profiles:
  - `PATCH /sessions/:id` adds participant data incrementally
- When host clicks "Begin Session":
  - `PATCH /sessions/:id` updates status to `"dividing"`, sets final participant list
- When host confirms divisions:
  - `PATCH /sessions/:id` updates status to `"active"`, adds `division_of_work`
- On session end:
  - `PATCH /sessions/:id` sets status to `"completed"`, adds `end_time`

### 2.2 — Server Reliability

**Goal:** Handle port conflicts, server crashes, and shareServer failures.

**Files to modify:**
- `src/serverManager.ts` — add auto-restart, port conflict detection
- `src/ui/initialSessionView.ts` — make shareServer failure visible

**Implementation:**
- In `serverManager.ts`:
  - On `close` event: attempt auto-restart up to 3 times with 2s delay between attempts
  - Show `vscode.window.showWarningMessage("Server disconnected, reconnecting...")` during restart
  - If retries exhausted: show error with "Restart Server" action button
  - Add port conflict detection: catch `EADDRINUSE` from server stderr, show specific error message suggesting to close the conflicting process
  - Add `restartServer()` public method for manual restart command
- In `initialSessionView.ts`:
  - Make `shareServer()` failure non-silent: show `vscode.window.showWarningMessage("Failed to share server port. Guests may not be able to connect.")`
- In `extension.ts`:
  - Register a `helloCigen.restartServer` command
- Add proper try/catch to all Express route handlers in `server.ts` to prevent unhandled exceptions from crashing the process

### 2.3 — API Key Pre-flight Check

**Goal:** Check for OpenAI API key at extension activation and at session start. Auto-dismissing notification.

**Files to modify:**
- `src/extension.ts` — add activation-time check and session-start check

**Implementation:**
- On extension activation (`activate()` function):
  ```typescript
  const apiKey = await context.secrets.get('openai-api-key');
  if (apiKey) {
    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, cancellable: false },
      async (progress) => {
        progress.report({ message: 'OpenAI API key found.' });
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    );
  }
  ```
  - This shows a notification that auto-dismisses after 10 seconds
- At the start of `helloCigen.start` command (before Live Share):
  - Check `context.secrets.get('openai-api-key')`
  - If missing: prompt with `showWarningMessage("No OpenAI API key set. AI features won't work.")` with an "Set API Key" action button
  - Also check `process.env.OPENAI_API_KEY` as fallback
  - If env var found but not in secrets: auto-store it in secrets
- Guests should never see this prompt (check Live Share role first)

### 2.4 — Folder Validation Guard

**Goal:** Prevent session creation without an open workspace folder.

**Files to modify:**
- `src/extension.ts` — add guard at top of `helloCigen.start`

**Implementation:**
```typescript
if (!vscode.workspace.workspaceFolders?.length) {
  vscode.window.showErrorMessage('Please open a folder before creating a session.');
  return;
}
```

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

- Phase 1 is the burning priority — extension is non-functional for guests without it
- Each phase must compile and produce a working VSIX before moving to the next
- The `status` field introduced in Phase 1 (in-memory on server) gets persisted to MongoDB in Phase 2
- All OpenAI API calls are host-only; guests never need the key
- `peerNumber` is the stable unique key for participant matching (replaces nullable `userId`)
- Chat history must be synced across all participants (not just persisted) — when Phase 1 guest sync is in place, chat sync should piggyback on the same state mechanism
- Auto-dismissing notifications pattern (`withProgress` + timeout) should be applied to other informational popups discovered during implementation — collect candidates as we go
