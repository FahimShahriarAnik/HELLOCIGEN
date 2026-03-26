# HelloCigen Testing Issues — Analysis & Triage

**Date:** 2026-03-26
**Branch:** `claude_playground` (post commit `c3ec01e`)
**Testers:** Multi-participant Live Share session

---

## Issue-by-Issue Analysis

### Issue 1: MongoDB doc not created after session name entered
**Priority: Low | Severity: None (Expected Behavior)**

This is **by design**, not a bug. The MongoDB document is created only when the host clicks "Begin Session" in `NewSessionCreationView`, which triggers `createSessionLog()` → `POST /sessions` → `coll.insertOne()`. The flow is:

1. Session name entered → Live Share starts, Express server spawns
2. Guests join and submit profiles → stored in-memory on server
3. Host selects project + clicks "Begin Session" → **MongoDB doc created here**

No action needed unless we want an earlier "draft" document.

---

### Issue 2: Participants join without host permission
**Priority: P3-Low | Severity: Medium**

**Root cause:** Live Share itself handles join permissions (via its own settings), not HelloCigen. The extension only has a "soft gate" — guests must submit a profile, and the host must click "Begin Session" after all profiles are in. But there's no explicit accept/reject UI.

**Was there ever a host approval gate?** Looking at the code and git history — no. The "permission" feeling likely came from Live Share's own access control settings (which can require explicit approval in VS Code settings).

**Options:**
- **(a)** Rely on Live Share's built-in approval (configurable in VS Code settings: `liveshare.guestApprovalRequired`)
- **(b)** Build a custom approval UI in the extension (significant effort, questionable value)
- **Recommendation:** (a) — document that hosts should enable `liveshare.guestApprovalRequired` in settings. Low effort, leverages existing infrastructure.

---

### Issue 3: Participant count increases only after S&W submission
**Priority: P3-Low | Severity: Low (Expected Behavior)**

This is **by design**. The "Participants Joined" counter in `NewSessionCreationView` polls `GET /sessions/:sessionId/pending-participants`, which only counts guests who have submitted profiles (stored in the in-memory `pendingParticipants` map). The counter reflects "confirmed" participants, not Live Share peers.

**Improvement idea:** Show two numbers — "Connected: X" (from `liveShare.peers.length`) and "Confirmed: Y" (from pending-participants). This gives the host visibility into who's connected but hasn't submitted yet.

---

### Issue 4: Doc not created even after all participants joined
**Priority: P1-High | Severity: High (if reproducible)**

If the host clicked "Begin Session" and the validation passed (confirmed count == expected count) but no document was created, this is a **real bug**. Possible causes:

- **Mismatch between `pendingParticipants` count and `participantCount`** — the host sets expected count manually, and the count includes the host, but pending only tracks guests. Check `newSessionCreationView.ts` validation logic.
- **Server not reachable** — Express server on port 4000 may not have started, or port sharing to guests may have failed.
- **Silent HTTP error** — `createSessionLog()` may fail without surfacing the error to the UI.

**However**, if the user means "joined Live Share" but didn't click "Begin Session" yet — then this is the same as Issue 1 (expected behavior). **Needs clarification.**

---

### Issue 5: Asks for OpenAI API key (mid-flow)
**Priority: P2-Medium | Severity: Medium**

The API key is only checked when `DivisionReviewPanel` opens (after session creation). If no key is set, it shows a warning and disposes the panel. The user must then manually set the key and somehow restart the division flow — which currently has **no re-entry path**.

**Problems:**
- No pre-flight check before session starts
- Panel disposes on missing key, no way to retry without restarting the whole session
- Guests don't need the key (only host), but this isn't communicated

**Fix:** Add a pre-flight check in `InitialSessionView` or at the start of the "Create Session" command. If no key, prompt immediately before any session setup.

---

### Issue 6: Task division only shown to host — ✅ RESOLVED (Phase 1)
**Priority: P0-Critical | Severity: High**

**By design currently**, but a critical UX gap. The `DivisionReviewPanel` is only created on the host's machine (`newSessionCreationView.ts` → `DivisionReviewPanel.createOrShow()`). Guests are stuck on the "Waiting for host..." screen with no visibility.

**After host confirms**, divisions are saved to MongoDB via `PATCH /sessions/:id`. The `TaskTrackerProvider` sidebar is then updated — but **only on the host's machine**. There's no mechanism to push division results to guest machines.

**Fix needed:** After host confirms divisions, guests need to:
1. Be notified that the session has progressed
2. See their assigned tasks (via TaskTracker or a dedicated view)
3. Transition from the "Waiting" screen to the development view

This requires a **notification/polling mechanism on the guest side**.

---

### Issue 7: Folder needs to be opened before session creation
**Priority: P3-Low | Severity: Low**

There's **no folder validation** in the codebase (`vscode.workspace.workspaceFolders` is never checked). If the extension misbehaves without an open folder, it's likely because Live Share or the file tracking features assume a workspace exists.

**Fix:** Add a guard at the top of the "Create Session" command:
```typescript
if (!vscode.workspace.workspaceFolders?.length) {
  vscode.window.showErrorMessage('Please open a folder before creating a session.');
  return;
}
```

---

### Issue 8: Participants not separately identified (u1, u2, host, peer2) — ✅ RESOLVED (Phase 1)
**Priority: P2-Medium | Severity: Medium**

**Root cause:** `session_log_utils.ts:24,34` uses fallbacks:
- Host: `s.user?.id ?? 'u1'`, `s.user?.displayName ?? "Host"`
- Guests: `p.user?.id ?? 'u${idx+2}'`, `p.user?.displayName ?? 'Peer${p.peerNumber}'`

The Live Share API **does** provide `user.id`, `user.displayName`, and `user.userName` (GitHub username) — but these are nullable. When they're null, fallbacks kick in. This happens when:
- User isn't signed into Live Share with a GitHub/MS account
- The `user` object hasn't populated yet (race condition)

**Fix options:**
- **(a)** Use the guest's self-reported `displayName` from the pending-participants submission (already available, already matched by userId in server.ts merge logic)
- **(b)** Require GitHub auth for Live Share (not controllable by extension)
- **(c)** Let guests set their own display name in the onboarding form

**For 3+ participants:** The current indexed fallback (`u2`, `u3`...) works for uniqueness but not for human identification. Real names from the pending-participants merge should fix this — **verify the merge is working correctly**.

---

### Issue 9: Task tracker not reflected in participant window — ✅ PARTIALLY RESOLVED (Phase 1)
**Priority: P1-High | Severity: High**

Two sub-problems:

**(a) Task status not synced across machines:**
- `taskTrackerProvider.ts:57` has a TODO: `// TODO: persist to MongoDB`
- Status changes are local-only — each machine has its own copy
- No real-time sync mechanism exists

**(b) TaskTracker not shown to guests at all:**
- `TaskTrackerProvider.instance?.setDivisions()` is only called on the host's machine
- Guest machines never receive division data to populate the tracker
- This ties directly to Issue 6

---

### Issue 10: Participant gets nothing after "Profile saved" popup — ✅ RESOLVED (Phase 1)
**Priority: P0-Critical | Severity: Critical**

After a guest submits their profile, they see "Profile saved! Waiting for host..." — and then **nothing ever happens**. The guest is permanently stuck because:

1. No polling/notification mechanism exists to tell the guest that the host confirmed
2. No code transitions the guest from `GuestOnboardingView` to `DevelopmentView`
3. No code pushes task division data to the guest
4. No chat UI is shown to the guest

**This is the single biggest broken flow in the extension.** The entire guest experience after profile submission is unimplemented.

---

### Issue 11: Chat history not logged / not connected to session doc
**Priority: P2-Medium | Severity: Medium**

- Both `DevChatPanel` and `ChatManager2` store history in memory only
- `SessionLogDocument` has no `chat_history` field
- Chat is lost on panel close or extension reload

**Fix:** Add a `chat_history` field to the session log schema and persist messages via `PATCH /sessions/:id` after each exchange.

---

## Independence Analysis

```
INDEPENDENT (can be worked on in parallel):
  [5] API key pre-flight check
  [7] Folder validation guard
  [8] Participant identification fix
  [11] Chat history persistence

DEPENDENT CLUSTER (must be designed together):
  [6] Division visibility for guests  ──┐
  [9] Task tracker sync              ──┤── All require a guest-side
  [10] Guest post-profile experience  ──┘   notification/state-sync mechanism

INFORMATIONAL ONLY (no code change needed):
  [1] Doc not created after session name  (expected behavior)
  [2] Join without permission             (Live Share setting)
  [3] Count after S&W only                (expected behavior, minor UX tweak)
  [4] Doc not created after all joined    (needs clarification — may be #1 again)
```

---

## Priority/Severity Matrix

| # | Issue | Priority | Severity | Independent? |
|---|-------|----------|----------|-------------|
| 10 | ~~Guest stuck after profile save~~ | ~~P0-Critical~~ | ~~Critical~~ | ✅ Phase 1 |
| 6 | ~~Division only shown to host~~ | ~~P0-Critical~~ | ~~High~~ | ✅ Phase 1 |
| 9 | ~~Task tracker not on participant~~ | ~~P1-High~~ | ~~High~~ | ✅ Phase 1 (partial — display works, real-time sync pending) |
| 4 | Doc not created after all joined | **P1-High** | **High** | Needs clarification |
| 5 | API key asked mid-flow | **P2-Medium** | **Medium** | Yes |
| 8 | ~~Generic participant names~~ | ~~P2-Medium~~ | ~~Medium~~ | ✅ Phase 1 |
| 11 | Chat history not persisted | **P2-Medium** | **Medium** | Yes |
| 2 | No join permission from host | **P3-Low** | **Medium** | Yes |
| 3 | Count only after S&W | **P3-Low** | **Low** | Yes |
| 7 | Folder must be opened first | **P3-Low** | **Low** | Yes |
| 1 | Doc timing | **None** | **None** | N/A |

---

## System Designer Perspective

The core architectural gap is: **there is no guest-side state machine**. The host has a well-defined flow (InitialSession → NewSession → DivisionReview → Development), but guests have exactly one step (Onboarding) and then nothing.

What's needed is a **session state synchronization layer**:
- The server should track session state (e.g., `pending`, `division_review`, `active`)
- Guests should poll for state changes (or use Live Share's shared service for real-time updates)
- On state transition, the guest extension should render the appropriate view

This is the single architectural piece that unblocks Issues 6, 9, and 10 simultaneously.

## Senior Developer Perspective

**Recommended execution order:**
1. **Design the guest state sync mechanism first** — this is the load-bearing architectural decision. Options: polling endpoint, Live Share shared state, or VS Code shared workspace state.
2. **Implement guest flow (Issue 10)** — wire up guest transitions from onboarding → waiting → development view
3. **Wire task tracker to guests (Issues 6 + 9)** — once guests can transition, push division data to them
4. **Quick wins in parallel:** Issues 5, 7, 8 are independent and small — can be done by anyone anytime
5. **Chat history (Issue 11)** — medium effort, independent, can be deferred

---

## Verification Checklist
- [ ] Test with 2+ participants in Live Share
- [ ] Verify full flow: host creates → guests join → profiles submitted → host sees division → host confirms → **guests see their tasks**
- [ ] Check MongoDB for complete session docs with proper participant names, division data, and chat history
- [ ] Confirm API key is checked before session starts
- [ ] Verify participant names are real names (not u1/u2) in MongoDB docs
