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

## Phase 3: Polish & Persistence ✅ COMPLETED

**Branch:** `phase-3-polish` (checkout from `phase-2-session-robustness`)
**Issues addressed:** 11, 2, 3
**Status:** Implemented and compiled. Ready for testing.

### 3.1 — Chat History Persistence + Real-time Sync ✅

- Added `ChatMessage` interface (`role`, `content`, `participant_name`, `timestamp`) and `chat_history?: ChatMessage[]` field to `SessionLogDocument` in `src/models/sessionLog.ts`
- `src/server/server.ts`: new `POST /api-key` endpoint stores OpenAI key in memory for server-side AI
- `src/server/server.ts`: new `POST /sessions/:id/chat` endpoint appends messages via atomic `$push`, generates AI response server-side if key available (supports `skipAi` flag)
- `src/server/server.ts`: new `GET /sessions/:id/chat?after=N` endpoint returns messages after index N for polling
- `src/server/server.ts`: `buildSystemPrompt()` builds AI context from session doc (project details, divisions, participant profiles)
- `src/server/server.ts`: added `project_title` to in-memory `SessionState` so guests receive it during state polling
- `src/ui/devChatPanel.ts`: complete rewrite — now accepts `sessionId`, `participantName`, `projectTitle`; POSTs messages to server (server handles AI); polls every 3s for new messages from all participants; UI shows sender names with human messages right-aligned and AI left-aligned
- `src/ui/developmentView.ts`: gets host name from VSLS API, passes `sessionId + hostName + projectTitle` to `DevChatPanel`
- `src/ui/guestDevelopmentView.ts`: now accepts `sessionId` + `projectTitle`, auto-opens `DevChatPanel` alongside task view
- `src/ui/guestOnboardingView.ts`: passes `sessionId` and `state.project_title` through to `GuestDevelopmentView`
- `src/ui/initialSessionView.ts`: forwards API key to server via `POST /api-key` after server start
- `src/extension.ts`: same API key forwarding in the legacy `helloCigen.start` flow
- `src/ui/chatManager2.ts`: gets session ID from Live Share on open; persists each message to server with `skipAi: true` (AI handled locally by chatManager2)

### 3.2 — Document Live Share Guest Approval Setting ✅

- `src/ui/newSessionCreationView.ts`: added tip text in session creation header — "To require approval for joining guests, enable `liveshare.guestApprovalRequired` in VS Code settings"

### 3.3 — Dual Participant Counter (Skipped)

- Not implemented — deferred to a future iteration

### 3.4 — Verification

- [ ] Open shared chat as host, send message → AI response appears
- [ ] Open shared chat as guest, send message → AI response appears, host sees it via polling
- [ ] Close chat panel, reopen → history loaded from MongoDB
- [ ] Check MongoDB doc → `chat_history` array populated with sender names and timestamps
- [ ] Host session creation view shows guest approval tip
- [ ] Build VSIX: `npx vsce package`

---

## Phase 4: Synced Task Tracking ✅ COMPLETED

**Branch:** `retrying_the_chat_feature` (checkout from `phase-3-polish`)
**Issues addressed:** Task Tracker updates are local-only — toggling a task on one machine is never persisted or broadcast to other participants.
**Status:** Implemented and compiled. Ready for testing.

### 4.1 — Server Endpoints for Division Updates ✅

- Added `GET /sessions/:session_id/divisions` in `src/server/server.ts` — returns current `division_of_work` from MongoDB
- Added `PATCH /sessions/:session_id/divisions` in `src/server/server.ts` — accepts updated `division_of_work` array, writes to MongoDB via `$set`

### 4.2 — TaskTrackerProvider Write-back ✅

- Added `setSession(sessionId: string)` method to `src/ui/taskTrackerProvider.ts`
- `_toggleTask` and `_toggleDivision` now call `_persistDivisions()` to PATCH the server after every toggle
- `reassignDivision` also persists via the same endpoint (replaces the old TODO)

### 4.3 — TaskTrackerProvider Polling ✅

- Added polling loop in `src/ui/taskTrackerProvider.ts` — polls `GET /sessions/:id/divisions` every 4 seconds
- Uses `divisionsFingerprint()` to compare fetched divisions with local state; refreshes UI only if changed
- Debounce: `_skipNextPoll` flag set after local changes to avoid flicker

### 4.4 — Wire Session ID to TaskTrackerProvider ✅

- `src/ui/developmentView.ts` — calls `TaskTrackerProvider.instance?.setSession(sessionId)` after setting divisions
- `src/ui/guestOnboardingView.ts` — calls `setSession(sessionId)` when guest transitions to active
- `src/ui/guestDevelopmentView.ts` — calls `setSession(sessionId)` after setting divisions/participants

### 4.5 — Verification

- [ ] Start a session with host + guest
- [ ] Host toggles a task → guest's tracker updates within 5 seconds
- [ ] Guest toggles a task → host's tracker updates within 5 seconds
- [ ] Restart extension → task states persist (fetched from MongoDB on reconnect)
- [ ] Build VSIX: `npx vsce package`

---

## Phase 5: Unified Team Chat with @AI ✅ COMPLETED

**Branch:** `retrying_the_chat_feature`
**Issues addressed:** Two competing chat implementations (`chatManager2` standalone + `DevChatPanel` collaborative); AI auto-responds to every message instead of on-demand.
**Status:** Implemented and compiled. Ready for testing.

### 5.1 — @AI Trigger in Server Chat Endpoint ✅

- Changed AI trigger in `POST /sessions/:session_id/chat` from `role === 'user'` to `/@ai\b/i` regex detection on message content
- Updated `buildSystemPrompt()` to explain CoGEN's role: only invoked on @AI mentions, rest of chat is human-to-human context
- Kept `skipAi` param as a fallback override

### 5.2 — DevChatPanel UI Update ✅

- Updated placeholder text in `src/ui/devChatPanel.ts` to `"Type a message... Use @AI to ask the AI"`
- No other UI changes — existing polling (3s), message attribution, and styling unchanged

### 5.3 — Remove chatManager2 ✅

- Deleted `src/ui/chatManager2.ts` and legacy `src/chatManager.ts`
- Removed `ChatManager2` import, instantiation, and `openChat`/`sendActiveFile` command handlers from `src/extension.ts`
- Removed `helloCigen.openChat`, `helloCigen.openChat2`, `helloCigen.sendActiveFile` from `package.json` commands and activation events (preserved in `_commented_out_commands` key for reference)

### 5.4 — Existing Flows Unchanged ✅

- **Guest flow stays as-is:** GuestOnboardingView → polls → GuestDevelopmentView → DevChatPanel opens alongside → TaskTracker in sidebar
- **Host flow stays as-is:** session creation → division review → DevelopmentView → DevChatPanel opens alongside
- API key flow unchanged — host sends key to server via `POST /api-key` at session start

### 5.5 — Verification

- [ ] Start a session, confirm division
- [ ] Verify DevChatPanel opens on both host and guest
- [ ] Host sends a regular message → guest sees it within 3 seconds, no AI response
- [ ] Guest sends `@AI what should I work on first?` → AI response appears for everyone
- [ ] Guest sends a regular message (no @AI) → no AI response, just the message shown to all
- [ ] Build VSIX: `npx vsce package`

### 5.6 — Bug Fix: Duplicate Messages on @AI Calls ✅

- **Root cause:** When sender POSTs an `@AI` message, OpenAI takes several seconds to respond. The 3s poll fires during that wait, picks up the user message from MongoDB, and displays it. Then the POST returns with `[userMsg, aiMsg]`, displaying the user message a second time and corrupting `lastIndex`.
- **Fix — client (`src/ui/devChatPanel.ts`):** Added `sending` flag; polls skip while a POST is in-flight. `lastIndex` now uses `total` from server response instead of incrementing blindly.
- **Fix — server (`src/server/server.ts`):** `POST /sessions/:id/chat` response now returns `total` (actual `chat_history` length after appended messages) so the client can sync its index accurately.

### 5.7 — Notes

- **Token cost scaling:** Full `chat_history` is sent to OpenAI on every `@AI` call (stateless — no OpenAI-side memory). Token costs grow with conversation length. Consider adding a server-side cap (e.g., last N messages) in a future iteration to avoid hitting token limits on long sessions.
- **Post-Phase 5 chat landscape:** `chatManager2` is removed. `DivisionReviewPanel` handles task division (pre-active), `DevChatPanel` is the sole team chat (active development).

---

## Phase 6: Session Completion & AI Summary

**Branch:** `session-dashboard` (checkout from `chat-queue`)
**Issues addressed:** No end-session flow exists; session lifecycle stops at "active" with no way to mark completion or generate a retrospective.
**Depends on:** Phases 1–5 (session state machine, chat persistence, synced task tracking, @AI chat)

### 6.1 — Add `summary` and `end_time` to SessionLogDocument

- **File:** `src/models/sessionLog.ts`
- Add two explicit optional fields to `SessionLogDocument`:
  ```typescript
  summary?: string;     // AI-generated session summary
  end_time?: string;    // ISO string, set when session completes
  ```
- No runtime impact — purely type additions. The interface already has `[key: string]: unknown` but explicit fields improve IntelliSense and documentation.

### 6.2 — Handle `status: "completed"` in PATCH Endpoint

- **File:** `src/server/server.ts`
- In the existing `PATCH /sessions/:session_id` handler, after the `division_of_work` block (~line 196), add:
  ```typescript
  if (update.status === "completed") {
    sessionStates.set(session_id, { status: "completed" });
    update.last_updated = new Date().toISOString();
  }
  ```
- This ensures guests polling `GET /sessions/:id/state` detect completion via the in-memory `sessionStates` map.

### 6.3 — Add `buildSummaryPrompt(session)` Function

- **File:** `src/server/server.ts`
- Separate from `buildSystemPrompt()` (which is for chat context). Constructs a prompt including:
  - Project title + description
  - Participants with roles, strengths, weaknesses
  - Division of work with task completion counts (done / in-progress / todo)
  - Session duration (start_time to end_time)
  - Chat history (skip system messages, limit to last ~50 messages to stay within token limits)
- Asks OpenAI to produce a structured summary with sections:
  1. **Session Overview** — duration, participants, project
  2. **Work Accomplished** — per-division task completion summary
  3. **Key Decisions** — extracted from chat history
  4. **Blockers & Unresolved Issues**
  5. **Recommendations for Next Session**

### 6.4 — Add POST `/sessions/:session_id/summary` Endpoint

- **File:** `src/server/server.ts`
- Fetches latest session log from MongoDB (by `session_number`)
- Calls OpenAI with `buildSummaryPrompt(session)` — uses same `openaiApiKey` variable as chat
- Persists `summary` field to MongoDB via `$set`
- Also stores summary in `sessionStates` map so guests can access it via state polling
- Returns `{ ok: true, summary: "..." }`
- If no API key configured: returns `{ ok: false, error: "No API key" }`

### 6.5 — Add GET `/sessions/:session_id/summary` Endpoint

- **File:** `src/server/server.ts`
- Fetches persisted summary from MongoDB (set by the POST call)
- Returns `{ ok: true, summary }` or 404 if not yet generated
- This is how guests fetch the summary after detecting completion via state polling

### 6.6 — Verification

- [ ] `npm run compile` — no TypeScript errors after type additions
- [ ] PATCH a session with `{ status: "completed" }` → `sessionStates` map updated
- [ ] `GET /sessions/:id/state` returns `{ status: "completed" }` after PATCH
- [ ] `POST /sessions/:id/summary` generates AI summary and persists to MongoDB
- [ ] `GET /sessions/:id/summary` returns the persisted summary
- [ ] Summary endpoint returns error gracefully when no API key is set

---

## Phase 7: Stateful Session Dashboard Sidebar

**Branch:** `session-dashboard` (same branch as Phase 6)
**Issues addressed:** Sidebar (`initialSessionView`) is static — always shows create/resume UI even after session is running. No way for host to end a session. No session summary visible to participants.
**Depends on:** Phase 6 (completion handling + summary endpoints must exist before the sidebar can call them)

### 7.1 — Rename File and Class

- **Rename file:** `src/ui/initialSessionView.ts` → `src/ui/sessionDashboard.ts`
- **Rename class:** `InitialSessionView` → `SessionDashboard`
- **Keep `viewId = "helloCigen.initialSession"` unchanged** — this is the string registered in `package.json` (line ~28) that binds the sidebar slot to this provider. Renaming it would require updating `package.json` contributions and could break activation events.
- Update imports in files that reference the old path:
  - `src/extension.ts` — change `from './ui/initialSessionView'` → `from './ui/sessionDashboard'`
  - (No other existing files import from `initialSessionView`)
- Add static `instance` property (same singleton pattern as `TaskTrackerProvider`)
- Add internal state fields:
  ```typescript
  private sidebarState: 'welcome' | 'dashboard' | 'completed' = 'welcome';
  public activeSessionId: string | undefined;
  private sessionData: any | null = null;
  private summaryText: string | undefined;
  private isHost: boolean = true;
  private pollTimer?: ReturnType<typeof setInterval>;
  ```

### 7.2 — Three-State Render Dispatch

- **File:** `src/ui/sessionDashboard.ts`
- Replace `render()` with a dispatcher:
  - `'welcome'` → `renderWelcome()` — returns **exactly** the current HTML (lines 41–250). Zero changes to existing welcome UI.
  - `'dashboard'` → `renderDashboard()` — new HTML showing session name, status badge, project title, participant list, division cards grid, and "End Session" button (host only, hidden when `isHost === false`)
  - `'completed'` → `renderCompleted()` — new HTML showing AI-generated summary text, loading spinner while summary generates, error + "Retry" button if generation fails, and "Start New Session" button that resets to welcome state
- Division cards layout adapted from `guestDevelopmentView` (use `minmax(200px, 1fr)` for sidebar width)

### 7.3 — Session Polling & State Transitions

- **File:** `src/ui/sessionDashboard.ts`
- Add `setActiveSession(sessionId, isHost)` public method — stores session ID, starts polling
- Add `startSessionPolling(sessionId)` — polls `GET /sessions/:id/state` every 5 seconds:
  - When status becomes `"active"` and sidebar is still in welcome → transition to dashboard
  - When status becomes `"completed"` → fetch summary via `GET /sessions/:id/summary` → transition to completed
- Add `stopPolling()` — clears interval timer
- **Edge case — sidebar collapsed:** State stored in instance variables. When VS Code calls `resolveWebviewView()` again (user clicks sidebar icon), it reads current state and renders correct HTML.

### 7.4 — End Session Flow

- **File:** `src/ui/sessionDashboard.ts`
- Add `endSession()` method (called from webview "End Session" button or auto-end):
  1. Idempotent guard — skip if `sidebarState === 'completed'`
  2. PATCH `/sessions/:id` with `{ status: "completed", end_time: new Date().toISOString() }`
  3. Set `sidebarState = 'completed'`, `summaryText = undefined` → render loading state
  4. POST `/sessions/:id/summary` → wait for AI summary
  5. Set `summaryText` from response → re-render with summary
- Add message handlers in `resolveWebviewView()`:
  - `'endSession'` → calls `endSession()`
  - `'newSession'` → resets all state, renders welcome
  - `'retrySummary'` → re-calls POST `/sessions/:id/summary`

### 7.5 — Hook Into Existing `startSession()` Method

- **File:** `src/ui/sessionDashboard.ts`
- After `NewSessionCreationView.createOrShow(...)` (line ~316), add:
  ```typescript
  if (sessionId) {
    this.activeSessionId = sessionId;
    this.isHost = true;
    this.startSessionPolling(sessionId);
  }
  ```
- Sidebar stays in welcome state during draft/dividing — only transitions to dashboard when polling detects "active". This preserves the current UX where the host works in NewSessionCreationView/DivisionReview before seeing the dashboard.

### 7.6 — Wire Up `extension.ts`

- **File:** `src/extension.ts`
- Update import: `import { SessionDashboard } from './ui/sessionDashboard';`
- Set singleton after instantiation: `SessionDashboard.instance = initialSessionProvider;`
- In guest detection block (after `GuestOnboardingView.createOrShow`), notify sidebar:
  ```typescript
  const sessionId = liveShare.session?.id;
  if (sessionId) {
    initialSessionProvider.setActiveSession(sessionId, false); // isHost = false
  }
  ```
- Add auto-end on Live Share disconnect (in existing `vsls.getApi().then(...)` block):
  ```typescript
  liveShare.onDidChangeSession(() => {
    const s = liveShare.session;
    if (!s || s.role === Role.None) {
      initialSessionProvider.endSession();
    }
  });
  ```

### 7.7 — Notify Sidebar from Development Views

- **File:** `src/ui/developmentView.ts` — after TaskTracker is populated, add:
  ```typescript
  import { SessionDashboard } from './sessionDashboard';
  SessionDashboard.instance?.setActiveSession(sessionId, true);
  ```
- **File:** `src/ui/guestDevelopmentView.ts` — after TaskTracker is populated, add:
  ```typescript
  import { SessionDashboard } from './sessionDashboard';
  SessionDashboard.instance?.setActiveSession(sessionId, false);
  ```
- These are belt-and-suspenders calls — polling should already detect the transition, but explicit notification ensures immediate sidebar update without waiting for the next 5s poll.

### 7.8 — Edge Cases

- **Sidebar collapsed during transition:** State stored in instance vars. `resolveWebviewView()` re-renders current state when sidebar is revealed.
- **Double endSession calls** (auto-end + manual click): `endSession()` is idempotent — checks if already completed before proceeding.
- **Summary generation fails:** Shows error message + "Retry" button. Session is still marked completed in MongoDB regardless.
- **Guest sees "End Session":** Button only rendered when `isHost === true`.
- **Server unreachable for guest summary fetch:** Only the host calls `POST /sessions/:id/summary` (one OpenAI API call). The summary is persisted to MongoDB. Guests fetch it via `GET /sessions/:id/summary` (a read from MongoDB, no AI call). If the server is unreachable when a guest tries to GET the summary, try/catch with fallback message; polling retries silently.

### 7.9 — Files Modified

| File | Change Scope | Risk |
|------|-------------|------|
| `src/ui/initialSessionView.ts` → `src/ui/sessionDashboard.ts` | Rename file + class → `SessionDashboard`, add state machine, 3 render methods, polling, end session | **Medium** — welcome HTML preserved verbatim |
| `src/extension.ts` | Update import path, singleton setup, guest mode, auto-end listener | Low |
| `src/ui/developmentView.ts` | 2 lines added (import + sidebar notify) | None |
| `src/ui/guestDevelopmentView.ts` | 2 lines added (import + sidebar notify) | None |

### 7.10 — Verification

- [ ] `npm run compile` — no TypeScript errors
- [ ] F5 launch → sidebar shows welcome UI (unchanged from current behavior)
- [ ] Start session → sidebar stays in welcome during draft/dividing phases
- [ ] Divisions confirmed → sidebar transitions to dashboard (status: active, division cards, participants)
- [ ] Host clicks "End Session" → AI summary generated → sidebar shows completed state with summary
- [ ] "Start New Session" button returns to welcome state
- [ ] Guest joins → sidebar shows dashboard after session becomes active
- [ ] Host ends session → guest sidebar shows same AI summary
- [ ] Close VS Code as host → Live Share disconnect triggers auto-end → summary generated
- [ ] Build VSIX: `npx vsce package`

### 7.11 — Implementation Order

Build Phase 6 first (all server-side, zero UI impact), then Phase 7:
1. `src/models/sessionLog.ts` — type additions (0 risk)
2. `src/server/server.ts` — completion handling + summary endpoints (additive, no existing behavior changed)
3. `src/ui/initialSessionView.ts` → rename to `src/ui/sessionDashboard.ts` + full refactor (welcome HTML preserved exactly)
4. `src/extension.ts` — update import path, wire singleton + guest mode + auto-end
5. `src/ui/developmentView.ts` — add sidebar notify (2 lines)
6. `src/ui/guestDevelopmentView.ts` — add sidebar notify (2 lines)
7. `npm run compile` + manual testing

---

## Notes

- **Phase 1 is complete** — guest state sync, polling, view transitions, and participant identification all implemented
- **Phase 2 is complete** — early draft doc creation, server auto-restart, API key pre-flight, folder guard all implemented
- **Phase 3 is complete** — chat persistence with real-time sync, server-side AI, guest approval tooltip all implemented
- **Phase 4 is complete** — synced task tracking with server persistence (PATCH/GET divisions endpoints), 4s polling with fingerprint-based diffing, debounce on local changes, session ID wired through host and guest flows
- **Phase 5 is complete** — unified team chat with @AI mention trigger, chatManager2 and legacy chatManager deleted, DevChatPanel is the sole chat, system prompt updated for on-demand AI role
- Each phase must compile and produce a working VSIX before moving to the next
- The `status` field is now persisted to MongoDB from doc creation (`"draft"` → `"dividing"` → `"active"`)
- The `initialSessionView` flow now creates a draft doc immediately; `newSessionCreationView` PATCHes it to `"dividing"` (no longer POSTs a new doc)
- The legacy `helloCigen.start` command flow still uses the old `createSessionLog` POST path
- OpenAI API key is forwarded from the extension host to the Express server via `POST /api-key`; server-side AI handles all chat responses so guests don't need the key
- `peerNumber` is the stable unique key for participant matching (replaces nullable `userId`)
- Chat is synced across all participants via server polling (3s interval in `DevChatPanel`); `chatManager2` persists with `skipAi: true` to avoid duplicate AI calls
- `DevChatPanel` auto-opens for both host (from `DevelopmentView`) and guests (from `GuestDevelopmentView`) after session becomes active
- Auto-dismissing notifications pattern (`withProgress` + timeout) is now used for the API key found notification; can be applied to other informational popups as needed
- **Phase 6 is server-only** — zero UI changes, purely additive endpoints. Safe to build and test independently before touching the sidebar.
- **Phase 7 renames** `initialSessionView.ts` → `sessionDashboard.ts` and class `InitialSessionView` → `SessionDashboard`. The `viewId` string `"helloCigen.initialSession"` in `package.json` is **not** renamed — it binds the sidebar slot and must stay stable.
- Only `src/extension.ts` has an existing import from `initialSessionView`; `newSessionCreationView.ts` does **not** import from it.
- The AI summary is generated server-side (same OpenAI client as chat) and persisted to MongoDB. Guests fetch it via `GET /sessions/:id/summary` — they never need the API key.
- **Security (future improvement):** The OpenAI API key is stored in plaintext in server memory and any Live Share participant can trigger API calls via server endpoints (e.g., @AI messages, summary generation) using the host's key. Risk is low (localhost-only server, encrypted Live Share tunnel, trusted collaborators), but future iterations should consider: rate limiting per participant, per-session token usage caps, or scoped API keys to prevent abuse.
