# Plan: AI-Assisted Task Redistribution (`/redistribute`)

## Context

HelloCigen's AI project manager currently distributes tasks once at session start and never revisits the division. Real projects mutate mid-session: new requirements arrive, scope shifts, teammates flag conflicts. Today the AI in chat has no way to act on this — it can only describe the situation. This feature adds a `/redistribute <new requirement>` slash command that triggers an AI re-plan of the *open* work, with the host gating the final apply.

The professor's constraints shape the design:
- **Don't delete already-assigned files** — each participant's file set can only grow.
- **Don't wipe completed or in-progress tasks** — those are frozen by id, title, files, status.
- **Manual trigger is fine** — we don't need AI tool-calling; the trigger is a deterministic slash command.

## Locked decisions

1. Trigger: **slash command** `/redistribute <new requirement>` in DevChatPanel. No AI tool-calling for v1.
2. Apply gate: **host accepts in chat** via narrow accept-keyword regex; reject keywords discard.
3. Preservation: **freeze done + in-progress tasks**; re-plan only `todo` items.
4. File ownership: **additive only** — a participant's `division.files` set never shrinks.
5. Guest dev view staleness: **banner** "Tasks updated — click to refresh" driven by a `division_version` stamp.

## Files to change

### Server

**`src/server/server.ts`**
- New endpoint `POST /sessions/:session_id/redistribute` (body: `{ new_requirement, reason?, triggered_by }`). Loads session, calls `generateRedistribution`, validates output, stores `pending_proposal` on the session doc, posts a chat message describing the proposal (uses the same `enqueueAiGeneration` queue for ordering).
- Extend chat handler at line 549–652: **before** queueing the AI call, check if `session.pending_proposal` exists, sender is the host (`session.participants.find(p => p.name === participant_name)?.role === "Host"` — role string from `roleToString` in `src/utils/liveshareHelpers.ts`), and content matches `/^\s*(accept|apply|approve|lgtm)\.?\s*$/i` or `/^\s*(reject|cancel|discard|no)\.?\s*$/i`. If matched, skip AI: on accept, write `pending_proposal.proposed_divisions` to `division_of_work`, bump `division_version`, clear `pending_proposal`, post "Task tracker updated" message. On reject, clear `pending_proposal`, post "Proposal discarded."
- New endpoint `GET /sessions/:session_id/divisions/version` returning `{ version: number }` from `session.division_version`. Lightweight — does not return the full division array.
- On every successful PATCH `/sessions/:session_id/divisions` (line 374) and on accept-apply, increment `session.division_version` in the same write.
- Update `buildSystemPrompt` at line 696: append a paragraph — *"If a participant raises a new requirement, scope change, or task conflict, tell them they can type `/redistribute <description>` to have the task division re-planned. You cannot trigger this yourself."*

**`src/utils/aiUtils.ts`**
- Add `generateRedistribution(project, participants, existingDivisions, newRequirement, apiKey): Promise<AiDivision[]>`. **Input `existingDivisions` is the full current `division_of_work` array loaded fresh from MongoDB at the moment `/redistribute` fires**, including every task's live `status` (`'todo' | 'in progress' | 'done'`). The AI therefore sees complete current state: who owns what files, what's already done, what's actively being worked, and what's still open. System prompt is the same CoGEN PM framing. User prompt structure:
  - Project + new requirement.
  - For each participant: their current `division.files` listed as **owned files (must remain in this participant's `files` set)**.
  - For each `done` and `in progress` task across all divisions: listed as **frozen tasks (id, title, files, status must appear unchanged in the output)**.
  - For each `todo` task: listed as **open work that may be added to, removed, retitled, reassigned, or split — subject to the file-additive rule**.
  - Instruction: produce exactly `participants.length` divisions with the same `owner_id`s. Each participant's `files` set must be a superset of their current files. Every frozen task must appear unchanged. Only `todo` tasks may be modified.
  - Return the same `AiDivision[]` shape.
- Add `validateRedistribution(existing, proposed): { ok: true } | { ok: false, violations: string[] }`. Checks: (a) participant count + owner_ids match; (b) each participant's proposed `files` ⊇ existing `files`; (c) every frozen task (by id) appears in the proposed output with identical fields. Used by the server before storing `pending_proposal`. On violation, the server retries `generateRedistribution` **once** with the violation list echoed back; if it still fails, the endpoint returns an error chat message ("Couldn't generate a valid redistribution — try rephrasing the requirement.")

**`src/models/sessionLog.ts`**
- Add fields to `SessionLogDocument`:
  ```ts
  division_version?: number;  // increments on every division mutation
  pending_proposal?: {
    id: string;
    new_requirement: string;
    reason?: string;
    proposed_divisions: AiDivision[];
    created_at: string;
    triggered_by: string;
  };
  ```

### Client

**`src/ui/devChatPanel.ts`**
- Intercept outgoing messages: if the content starts with `/redistribute ` (case-insensitive, with at least one trailing char), strip the prefix and POST to `/sessions/:id/redistribute` instead of `/sessions/:id/chat`. Echo the original `/redistribute …` text to chat as the sender's message (so others see what was requested).

**`src/ui/guestDevelopmentView.ts`**
- After initial `setDivisions()`, start polling `GET /sessions/:id/divisions/version` every 8 seconds.
- Track the version seen at initial render. When the polled version > seen version, render a non-blocking banner: *"Tasks have been updated. Click to refresh."*
- Banner click handler: fetch `/sessions/:id/divisions`, re-run `setDivisions` with the new array, update seen version, hide banner.
- Stop polling on panel dispose.

**`src/ui/taskTrackerProvider.ts`**
- No code changes needed — already polls `/sessions/:id/divisions` every 4s and diffs by fingerprint (line 122-152). Will pick up redistributed state automatically.

**`src/ui/sessionDashboard.ts`**
- No code changes needed — already polls `/sessions/:id/state` every 5s, which includes `division_of_work` (line 440).

## Edge cases handled

- **Stale TODO id after redistribution**: if a guest's PATCH targets a task id removed by redistribution, server returns 404 → sidebar's next 4s poll picks up new state and the user sees a "tasks were updated" toast (add to existing fetch error handler in `taskTrackerProvider._fetchDivisions`).
- **File overlap**: `src/api.ts` may end up in two divisions' `files` arrays. Accept this — the data model permits it, and the file presence decorator already handles multi-owner display.
- **Accept keyword said during normal chat (no pending proposal)**: the pre-AI keyword check is **gated by `session.pending_proposal` existing**. If no proposal is pending, "accept" / "apply" / "lgtm" do nothing special — message flows through the normal AI handler as regular chat. Nothing gets written, nothing gets applied.
- **Accept-keyword false positive while a proposal IS pending**: regex anchored to start-and-end of the message and limited to standalone words (`/^\s*(accept|apply|approve|lgtm)\.?\s*$/i`). "I accept your point", "yeah accept that", "yeah looks good but…" all fail the anchor → fall through to the normal AI handler. Host must type the keyword as a standalone reply to trigger apply.
- **Non-host accept**: pre-AI check requires sender's `role === "Host"`; non-host accepts fall through to AI even with a pending proposal.
- **Concurrent `/redistribute` calls**: the second supersedes the first; server posts "Previous proposal was superseded by a newer one." in chat.
- **Server restart with pending proposal**: persisted on the session doc, survives.
- **AI ignores constraints**: validated server-side, one retry with violation echoed, fall back to error message in chat.
- **`/redistribute` with empty body**: client validates non-empty before sending; server also rejects.
- **Session not in `active` state**: server rejects with 400 — only allowed when `status === 'active'`.

## Known risks to monitor during Phase 1 testing

- **`validateRedistribution` may reject too eagerly.** The strict comparison (exact title match, file-set superset, status verbatim, owner_id continuity) leans on gpt-4 copying frozen tasks character-perfect. Likely failure modes: subtle title rewording ("Add OAuth login" → "Implement OAuth login"), dropping a file from `division.files` while the prompt's attention is on adding new ones, status casing drift. The retry-once loop in the server catches one such miss; persistent hallucination falls back to an error chat message. Watch `console.warn('[validateRedistribution] violations:', …)` in the server logs during manual testing — every violation list is logged. If we see frequent rejections we may need to either (a) loosen the validator (allow superset on title-equivalence, normalize whitespace), or (b) tighten the prompt with more emphatic "copy verbatim" language, or (c) bump from `gpt-4` to `gpt-4o`.

## Out of scope

- Adding new participants mid-session (redistribution stays within the current team).
- AI tool-calling (`propose_redistribution` as a function) — can be added later behind the same backend.
- SSE push for division updates — banner+polling is enough for v1.
- Auto-resolving file-ownership ambiguity when overlap occurs.
- Model bump from `gpt-4` to `gpt-4o` (separate PR).

## Phased rollout

Ship in three checkpoints so each layer is verified before the next is built. Each phase is independently testable and commit-worthy.

### Phase 1 — Propose only (no apply yet)
Goal: `/redistribute <text>` from chat produces an AI-generated proposal that's posted back to the chat panel. Nothing is written to `division_of_work` yet.

Build:
- `generateRedistribution` + `validateRedistribution` in `src/utils/aiUtils.ts`.
- `POST /sessions/:session_id/redistribute` endpoint in `src/server/server.ts` — generates, validates, **stores `pending_proposal` on the session doc**, posts a human-readable proposal message to chat (via `enqueueAiGeneration`). Does **not** modify `division_of_work`.
- Slash-command interception in `src/ui/devChatPanel.ts`.
- Schema additions to `src/models/sessionLog.ts` (`pending_proposal` + `division_version`).

Manual checkpoint: in a 2-window Live Share session, type `/redistribute add OAuth login`. Verify a proposal message appears in chat describing the planned changes. Verify the sidebar task tracker is **unchanged** (because nothing is applied yet). Verify the `pending_proposal` field is present on the session document in MongoDB.

### Phase 2 — Accept detection + apply
Goal: when host types a standalone accept keyword, the pending proposal is applied to `division_of_work` in MongoDB, the task tracker sidebar picks it up via its existing 4s poll, and the session dashboard picks it up via its existing 5s poll.

Build:
- Pre-AI keyword check in the chat handler at `src/server/server.ts:549-652`. Gated by `pending_proposal` existing + sender role === "Host".
- On accept: write `pending_proposal.proposed_divisions` to `division_of_work`, bump `division_version`, clear `pending_proposal`, post "Task tracker updated" message.
- On reject: clear `pending_proposal`, post "Proposal discarded."
- Increment `division_version` in the existing PATCH `/sessions/:session_id/divisions` handler at line 374 too, so the version stamp is consistent across all mutation paths.

Manual checkpoint: continue the Phase 1 session. Host types `accept`. Verify within ~4s the task tracker sidebar shows the new tasks. Verify done + in-progress tasks from before the redistribution are unchanged. Verify no file has been removed from any participant's `files` list. Verify a non-host typing `accept` does nothing. Verify `lgtm` at random during normal chat (no pending proposal) does nothing.

### Phase 3 — Guest dev view banner
Goal: guests viewing the post-division development panel see a "Tasks updated — click to refresh" banner when redistribution is applied.

Build:
- `GET /sessions/:session_id/divisions/version` endpoint in `src/server/server.ts`.
- 8s polling + banner UI in `src/ui/guestDevelopmentView.ts`.
- Stale-id toast in `taskTrackerProvider._fetchDivisions` (defensive — covers the edge case from the Edge cases section).

Manual checkpoint: with guest dev view open, trigger redistribution + accept. Verify banner appears within ~8s. Click refresh and confirm new tasks render in the dev view.

## Verification

1. **Build**: `npm run compile` — must pass with no TS errors.
2. **End-to-end manual test** (host + one guest via two VS Code windows + Live Share):
   - Start a session, confirm initial division.
   - Guest marks one task `in progress`, host marks another `done`. Note the file lists per participant.
   - Host types `/redistribute add OAuth login support` in chat.
   - Verify proposal message appears, describing only changes to `todo` items and no removal of any existing file.
   - Verify guest's task tracker sidebar updates within 4s of host typing `accept`.
   - Verify guest's development view shows the banner; click refresh and confirm new tasks render.
   - Verify the `done` and `in progress` tasks from step 2 are unchanged in both views.
3. **Constraint violation test**: temporarily relax the validator to log violations, run redistribution against a session where the AI is likely to drop a file (e.g., one with very narrowly-scoped files), confirm the retry loop fires.
4. **Accept-keyword regex**: unit-test the regex against the cases listed in the edge-cases section.
5. **Concurrent proposals**: run two `/redistribute` calls back-to-back from two participants; verify the second supersedes and the chat shows the supersession message.

## Reference: code locations touched

- `src/server/server.ts:549-652` — chat handler (pre-AI keyword check)
- `src/server/server.ts:374` — PATCH divisions (version bump)
- `src/server/server.ts:696` — `buildSystemPrompt` (mention `/redistribute`)
- `src/utils/aiUtils.ts:24-89` — sibling to `generateDivisionOfWork`
- `src/models/sessionLog.ts` — `SessionLogDocument` schema
- `src/ui/devChatPanel.ts` — slash-command interception
- `src/ui/guestDevelopmentView.ts:49` — version polling + banner
- `src/ui/taskTrackerProvider.ts:122-152` — already polls (no change)
- `src/ui/sessionDashboard.ts:108-110` — already polls (no change)
