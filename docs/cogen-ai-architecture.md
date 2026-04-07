# CoGEN — AI Architecture & Prompt Enhancement Plan

> Where OpenAI API calls are made, what is sent in each prompt, and what should be added to make CoGEN a fully-aware project manager.

---

## Part 1 — Current API Calls

### Call 1 — Division of Work Generation

**File:** `src/utils/aiUtils.ts:61–68`
**Trigger:** Host starts a session; AI splits the project into per-developer chunks
**Model:** `gpt-4` · `max_tokens: 1500`

**System prompt:**
- CoGEN identity as project manager
- Be concise, actionable, engineer-focused; analyze holistically across architecture/testing/deployment

**User message:**
- Project title + full project JSON
- Participant profiles (name, strengths, weaknesses) — omitted if unavailable
- Instruction to divide into exactly N parallel divisions, JSON output only

---

### Call 2 — @AI Chat Response

**File:** `src/server/server.ts:470–482`
**Trigger:** Any chat message matching `/@ai\b/i`
**Model:** `gpt-4` · `max_tokens: 1000`

**System prompt** (built by `buildSystemPrompt()`):
- CoGEN identity as embedded team chat assistant
- Project title + description
- Full task breakdown with owner IDs and task titles *(status not included — see gaps below)*
- All participant names/IDs with strengths/weaknesses

**User messages (chat history):**
- Every message in the session from MongoDB, in chronological order — **unbounded, no cap**
- User messages formatted as `[ParticipantName]: <content>`; assistant messages as raw content
- The triggering `@AI` message is the last entry

---

### Call 3 — Session Summary

**File:** `src/server/server.ts:668–673`
**Trigger:** `POST /sessions/:id/summary` at session end
**Model:** `gpt-4` · `max_tokens: 2000`

**System prompt only** (built by `buildSummaryPrompt()`), includes:
- CoGEN identity as retrospective generator
- Project title + description
- Session start/end time
- All participants with roles, strengths, weaknesses
- Division of work with per-task completion counts and `[status] task title` per task
- Last 50 chat messages for key decision extraction
- Requested output: 5-section retrospective (Overview, Work Accomplished, Key Decisions, Blockers, Recommendations)

---

## Part 2 — Known Gaps (Current State)

| # | Location | Issue | Status |
|---|----------|-------|--------|
| 1 | `buildSystemPrompt()` `server.ts:556` | Task `status` (`todo`/`in progress`/`done`) excluded — AI cannot answer progress questions | ✅ Fixed |
| 2 | `buildSystemPrompt()` `server.ts:555–558` | `owner_id` (e.g. `u1`) never resolved to participant name — meaningless to GPT-4 | ✅ Fixed |
| 3 | `buildSystemPrompt()` | Session metadata missing: session number, name, start time, elapsed duration, complexity | Open |
| 4 | `buildSystemPrompt()` | Previous session summary never included — continuation sessions have no history | Open |
| 5 | Chat `@AI` handler `server.ts:457–460` | Chat history is unbounded — no truncation before sending to GPT-4 (token limit risk) | Open |
| 6 | `aiUtils.ts:71` | `JSON.parse(content) as AiDivision[]` — no runtime validation; silent failures if AI returns wrong shape | Open |

---

## Part 3 — Enhancement Plan for buildSystemPrompt()

All changes are confined to `src/server/server.ts`. No new files, no schema changes.

### Priority 1 — Resolve `owner_id` → participant name ✅ DONE
**Zero cost.** Build a `nameById` map from `participants[]` and use it in division rendering.
```
BEFORE: Teammate 1 (u1): Auth Module
AFTER:  Alice (Auth Module) — 2 done, 1 in progress, 2 todo
```

### Priority 2 — Task + subtask status with counts ✅ DONE
**Zero cost.** Replace bare-title task formatter with rich status formatter. Reuses `countByStatus` pattern from `buildSummaryPrompt` (lines 605–614).
```
Alice (Auth Module) — 2 done, 1 in progress, 2 todo
  - [done] Build login form
  - [in progress] Set up DB schema
      - [done] Write migration
      - [todo] Seed data
  - [todo] Write tests
```

### Priority 3 — Session metadata line
**Zero cost.** All fields already in the session document.
```
Session #2 "Sprint 2 — Auth Flow" | Status: active | Running: 1h 23m | Complexity: medium
```
Fields: `session_number`, `session_name`, `status`, `start_time`, `project_details.complexity`

### Priority 4 — Participant role + join offset
**Zero cost.** Extend participant list with `role` and guest join offset.
```
Alice (Host) — Strengths: systems design, Weaknesses: frontend
Bob (Guest, joined +4m) — Strengths: React, Weaknesses: backend
```

### Priority 5 — Previous session summary for continuations
**Requires 1 extra DB query** in the `enqueueAiGeneration` async block (not in `buildSystemPrompt` — keep that synchronous).
- Query: find session with same `session_id` and `session_number - 1`, read its `summary` field
- Pass via new optional `options?: { previousSummary?: string }` parameter
- Truncate to 800 chars for safety
- Only performed when `session.session_number > 1`

### Priority 6 — Chat history truncation (reliability fix)
**Cap to last 40 messages.** Change in the queue handler at line ~457:
```typescript
const allMessages = await chatColl
  .find({ session_id })
  .sort({ _id: -1 })
  .limit(40)
  .toArray();
allMessages.reverse(); // restore chronological order
```

---

## Final Structure of Enhanced buildSystemPrompt(session, options?)

```
1. Identity preamble              (unchanged)
2. Session metadata line          [NEW — Priority 3]
3. Project title + desc + complexity
4. Previous session summary       [NEW — Priority 5, conditional]
5. Task breakdown                 [ENHANCED — owner names + [status] + subtasks + counts]
6. Participant list                [ENHANCED — role + guest join offset]
7. Closing instruction            (unchanged)
```

---

## Token Budget

| Section | ~Tokens |
|---|---|
| Identity + metadata | 75 |
| Project info | 80 |
| Previous summary (≤800 chars) | 200 |
| Task breakdown (3 divisions, 4 tasks ea.) | 300 |
| Participants (4 people) | 120 |
| Closing | 30 |
| **System prompt total** | **~805** |
| Chat history (40 msgs × 50 tok avg) | ~2000 |
| AI response budget | 1000 |
| **Total context used** | **~3805 / 8192** ✅ |

---

## Implementation Order

1. ✅ `owner_id` → name resolution — test: `@AI who owns the auth module?`
2. ✅ Task status + subtask formatting — test: `@AI what's left to do?`
3. Chat history truncation (cap to 40) — test: long session with 100+ messages
4. Session metadata line — test: `@AI how long have we been running?`
5. Participant role + join offset — test: `@AI who joined late?`
6. `previousSummary` DB query + signature change — test: session #2 asking `@AI what did we finish last session?`
