# MongoDB Persistence — Investigation Brief

For a fresh chat to pick up the MongoDB persistence problem cleanly, separate from the `/redistribute` work.

## Problem

HelloCigen's MongoDB persistence is broken end-to-end. `GET /sessions` returns HTTP 500, writes silently fail. Server log shows `Atlas Data API [aggregate] failed: 404 {"error":"cannot find app using Client App ID 'YOUR_APP_ID_HERE'"}`. Root cause: `src/utils/config.ts` is committed with literal placeholder strings.

## Constraints (non-negotiable)

- Reads/writes go to a shared **MongoDB Atlas** cluster — must work from any developer's machine, online.
- **No secrets committed to git.** No connection strings, no API keys, no app IDs in tracked files.
- The "each dev pastes credentials into a local file by hand" workflow is **not the solution**. Whatever the team picks must scale to new contributors.

## Error messages observed (verbatim, for grep)

**Client-side toast / webview status line:**
```
Failed to load sessions: Error: HTTP 500: {"ok":false,"error":"Failed to fetch sessions"}
```

**Server log ("Server Manager" output channel in VS Code):**
```
Error: Atlas Data API [aggregate] failed: 404 {"error":"cannot find app using Client App ID 'YOUR_APP_ID_HERE'"}
    at apiAction (.../out/server/db.js:36:15)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async Object.toArray (.../out/server/db.js:82:27)
    at async .../out/server/server.js:212:22
```

The 404 message tells us two things at once: (a) the endpoint `data.mongodb-api.com/app/{id}/endpoint/data/v1/action/aggregate` is **still reachable**; (b) the literal placeholder string `YOUR_APP_ID_HERE` is being sent because `src/utils/config.ts` was never filled in.

**Silent-write symptom (no error visible to the user):**
Before the 500 became prominent, the user reported that session documents stopped appearing in Atlas during and after Live Share sessions, even though the local extension UI (task tracker, chat, session dashboard) kept working. Diagnosis: writes from `taskTrackerProvider._persistDivisions` and similar call sites use `.catch(() => {})` ("Non-critical — local state is already updated"), so the same 404 that surfaces on `/sessions` reads is **silently swallowed** on writes. The in-memory state diverged from Atlas with no user-visible indication.

**Other related symptom (historical, already fixed):**
`Error: Redistribute failed: Session must be active to redistribute (current status: dividing)` — appeared during Phase 1 redistribute testing because in-memory `sessionStates` was the source of truth for `"active"` while MongoDB was never updated. Patched by mirroring `status: "active"` into the MongoDB write when `division_of_work` is set. Note as evidence of repeated in-memory ↔ MongoDB drift; the same class of bug should be looked for during the new investigation.

## What's already known

**Commit `d3a9984`** (Anan, 2026-05-21, "switch MongoDB persistence to Atlas Data API"):
- Created `src/utils/config.ts` with three placeholder constants (`ATLAS_APP_ID`, `ATLAS_API_KEY`, `ATLAS_DATA_SOURCE`).
- Rewrote `src/server/db.ts` to POST to `https://data.mongodb-api.com/app/{APP_ID}/endpoint/data/v1/action/{op}` with `api-key` header.
- 12-line tweak to `src/server/server.ts` for the new async/result shape.

**MongoDB Atlas Data API is officially deprecated.** Their own migration tutorial is titled *"Implement an Express.js Alternative to the Atlas Data API"* — MongoDB's recommended replacement is native driver behind your own Express server. HelloCigen already has the Express server in `src/server/server.ts`; the pre-d3a9984 architecture was already this shape.

**Atlas Admin API v2** does infrastructure only (clusters, users, IAM, billing). No document CRUD. Not a Data API replacement.

**`src/utils/config.local.ts`** is git-ignored and contains a working `MONGO_URI` for `cluster0.fp3ny34.mongodb.net`. Useful as a reference, but file-local credentials don't satisfy the "any-machine, no-manual-setup" constraint.

**Existing secret-delivery pattern in the codebase** — the OpenAI API key uses VS Code secret storage (`context.secrets.store('openai-api-key')` in `src/extension.ts`) and is forwarded to the forked server via `POST /api-key`. Pattern works for per-developer secrets but does not solve the shared-cluster credential distribution problem on its own.

## Temporary local stopgap (stashed)

A native-driver port of `db.ts` that imports `MONGO_URI` from `config.local.ts` is stashed:

```
stash@{0}: On action-items: local-mongodb-stopgap: native driver via config.local.ts
```

Apply with `git stash apply stash@{0}` (use **apply**, not pop, to keep the stash intact) when local testing is needed. **This is not the proposed solution** — it depends on a file-local URI and won't work for a fresh contributor. It exists only so the redistribute feature could be tested while the real MongoDB plan is being figured out.

## What to investigate

1. Confirm the Atlas Data API endpoint behavior: the 404 with that exact message means the endpoint *is* still reachable. Decide whether the API is still serving grandfathered apps (Anan's might still work for him) or fully retired. This determines whether `d3a9984` is salvageable with real credentials or must be fully reverted.
2. Pick a credential-distribution strategy that satisfies the constraints. Candidates to weigh:
   - **VSIX-bundled API key with cluster-side restrictions** (write-only, scoped to `session_logs` DB). Anan considered this — key is extractable from VSIX, but blast radius is bounded by cluster IAM. Operationally simple. Possible Data API path.
   - **Backend service** that the extension authenticates against (developer logs in once, service holds the Mongo connection). Heaviest lift; requires hosting.
   - **MongoDB Atlas App Services** as the long-term Data API replacement (if still operational post-deprecation).
   - **Native driver + a credential service** (vault, AWS Secrets Manager, GitHub Actions secrets — depends on team infra).
3. Talk to Anan: was there a constraint driving the Data API choice that's not visible in the diff? (e.g., corporate policy against shipping connection strings, MongoDB Atlas tier restriction, etc.)
4. Defensive improvements regardless of which path wins:
   - `GET /health` should actually probe MongoDB so the next breakage isn't silent (currently returns 200 even when Atlas is unreachable).
   - Write call sites (e.g., `taskTrackerProvider._persistDivisions`) shouldn't swallow errors via `.catch(() => {})`.

## Files of interest

- `src/server/db.ts` — current Atlas Data API HTTP wrapper. Replace per chosen strategy.
- `src/utils/config.ts` — committed placeholders. Should be deleted, replaced, or sourced from somewhere non-committed.
- `src/server/server.ts` — `/api-key` endpoint near line 130 area; pattern for delivering secrets to the forked server child process.
- `src/extension.ts` — `context.secrets.store('openai-api-key')` reference for the VS Code secret-storage pattern.
- `src/serverManager.ts` — owns the forked-process lifecycle; relevant if credentials need to be passed at fork time.

## Status

Redistribute feature work is committed on `action-items`. MongoDB stopgap is stashed. This file exists so a fresh investigation can start cold without re-deriving any of the above.
