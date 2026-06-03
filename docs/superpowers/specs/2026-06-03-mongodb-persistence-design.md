# MongoDB Persistence — Design Spec

**Date:** 2026-06-03
**Branch:** `action-items-to-mongodb-fix`
**Supersedes:** commit `d3a9984` ("switch MongoDB persistence to Atlas Data API")

## Problem

HelloCigen's MongoDB persistence is broken end-to-end. `src/utils/config.ts` ships placeholder strings (`YOUR_APP_ID_HERE`, `YOUR_API_KEY_HERE`), so every Atlas Data API call returns 404. Reads visibly fail (`GET /sessions` returns 500); writes silently fail because call sites like `taskTrackerProvider._persistDivisions` swallow errors with `try { ... } catch { /* Non-critical */ }`. The result: in-memory UI state diverges from MongoDB with no user-visible indication.

The Atlas Data API itself is officially deprecated; MongoDB's own migration guide recommends an Express + native-driver replacement. Filling in real credentials for `d3a9984` would buy at most a few months before the endpoint is fully retired.

A temporary stopgap (native driver imported from git-ignored `config.local.ts`) lives in `stash@{0}` and was used to test the redistribute feature, but it doesn't satisfy the "any contributor can clone and run" constraint.

## Constraints (non-negotiable)

- Reads/writes go to a shared MongoDB Atlas cluster (`cluster0.fp3ny34.mongodb.net`, DB `session_logs`).
- No secrets committed to git. No URIs, API keys, or app IDs in tracked files.
- "Each dev pastes credentials into a local file by hand" is not the solution. Onboarding must scale.
- Distribution model: contributors build from source during dev; end users install a prebuilt `.vsix`. Two credential paths must be considered.

## Decision

**Native MongoDB driver + connection URI bundled at build time via env-var substitution, with the Atlas user scoped by IAM to `readWrite@session_logs` only.**

A hosted relay was considered and rejected on cost/benefit: a relay needs its own bearer token (also extractable from the VSIX) to keep randoms out, so the actual security surface is equivalent to a bundled URI; the relay's only real win is credential rotation without VSIX redistribution, which is not a recurring need for this project. A relay also adds ongoing hosting maintenance and free-tier cold-start latency.

**Trust model:** the URI is extractable from any shipped `.vsix` by `unzip + grep`. Atlas IAM bounds the blast radius: a leaked URI grants `readWrite` on the `session_logs` database only — no `dbAdmin`, no other databases, no cluster admin. Worst case if leaked: someone writes garbage docs into your collections. Recovery: rotate Atlas password → rebuild + reship VSIX → bump version.

## Architecture

```
Dev path:          .env (git-ignored)  ─┐
End-user path:     CI/build env var    ─┴─→ scripts/gen-config.js
                                            ↓
                                         src/utils/generated-config.ts (git-ignored)
                                            ↓ import
                                         src/server/db.ts (native mongodb driver)
                                            ↓
                                         Atlas (cluster0.fp3ny34.mongodb.net / session_logs)
```

The forked-child Express server architecture (`serverManager.ts` → `src/server/server.ts`) is preserved. All HTTP routes, UI/webview code, and the SSE chat stream are unchanged. Only the persistence layer underneath is swapped.

## Credential delivery mechanism

**`scripts/gen-config.js`** (new, ~25 lines, Node):

1. Load `process.env.MONGO_URI`. If absent, attempt to read `.env` at project root via `dotenv`.
2. If still unset, fail with a clear error message pointing the contributor to the team's documented URI source (see Action Items at the end of this spec — the source location must be agreed before this script ships).
3. Write `src/utils/generated-config.ts`. Concrete output shape:
   ```ts
   // AUTO-GENERATED. Do not edit. Run `npm run gen-config` to regenerate.
   export const MONGO_URI = "mongodb+srv://...@cluster0.fp3ny34.mongodb.net/...";
   ```
   The script uses `JSON.stringify(uri)` to produce the quoted literal, which safely escapes any characters in the URI (`&`, `:`, `/`, `?`, `@` are all fine in a quoted JS string; `JSON.stringify` is the bulletproof way regardless).

**`package.json` scripts:**

```json
"gen-config": "node scripts/gen-config.js",
"compile":    "npm run gen-config && tsc -p ./",
"watch":      "npm run gen-config && tsc -watch -p ./",
"build":      "npm run gen-config && tsc -p ./ && npx @vscode/vsce package"
```

**`.gitignore` additions:** `src/utils/generated-config.ts`.

**Dev workflow:** clone → `npm install` → copy URI from documented source into `.env` (one-time) → `npm run compile` → F5. The `.env` paste is the *only* manual step, and it pulls from a single canonical URL (Discord pin / class wiki / private gist), not from edits to source files. This is the documented onboarding for new contributors.

**End-user VSIX:** built once with `MONGO_URI=... npm run build`. The URI ends up baked into `out/server/db.js` inside the `.vsix`. End users install the `.vsix` and run; no env var, no `.env`, nothing.

**Atlas IAM setup** (manual, one-time, in Atlas console):

1. Database Access → Add New Database User
2. Username: `hellocigen-app`. Authentication: password (generate a long random one).
3. Database User Privileges: **Built-in Role** → `readWrite` → Specific Database → `session_logs`.
4. No other roles.
5. Network Access: allowlist `0.0.0.0/0` (end users connect from anywhere). This is the standard tradeoff for any client-side DB driver app; the per-user-DB IAM scope is what bounds the risk.
6. Update the URI in the team-documented source with the new credentials.

## File changes

| File | Action |
|------|--------|
| `src/server/db.ts` | Rewrite to native `mongodb` driver. Apply `stash@{0}` as starting point, with adjustments listed below. |
| `src/utils/config.ts` | **Delete.** Source of the `YOUR_APP_ID_HERE` bug. |
| `src/utils/config.local.ts` | **Delete.** Replaced by `generated-config.ts`. |
| `src/utils/generated-config.ts` | New, git-ignored, written by `scripts/gen-config.js`. |
| `scripts/gen-config.js` | New. ~25 lines. |
| `package.json` | Add `gen-config` script; chain into `compile`/`watch`/`build`. Add `dotenv` dependency. |
| `.gitignore` | Add `src/utils/generated-config.ts`. |
| `.vscodeignore` | No change — `src/**` already excluded; `out/**` is bundled by default. |
| `src/server/server.ts` | (1) `/health` probes MongoDB via `pingDb()`, returns 503 on failure. (2) Log `cluster + database + collections` on startup. (3) Close MongoClient on shutdown. |
| `src/extension.ts` line 163 | Replace `.catch(() => {})` with `.catch(err => output.appendLine(...))`. |
| `src/ui/taskTrackerProvider.ts` line 206-219 | Check `resp.ok` in `_persistDivisions`; surface failures via `vscode.window.showWarningMessage`. |
| `src/ui/taskTrackerProvider.ts` line 201-203 | `_triggerCodeReview` catch → log to output channel (genuinely non-critical). |

### Adjustments to the stashed `db.ts`

- Import `MONGO_URI` from `../utils/generated-config` (not `config.local`).
- Add exported `pingDb()` running `db.command({ ping: 1 })`. Returns `boolean`.
- Add exported `closeDb()` calling `client.close()`. Called from `server.ts` shutdown handlers.
- Reset `dbPromise` if the initial `connect()` rejects, so a transient first-connect failure doesn't brick the server forever.
- Keep the `{$oid: hex}` normalize/denormalize helpers as-is — `server.ts` chat-cursor code (line 932, 947) depends on this contract.
- Comment in `db.ts` noting we rely on the driver's built-in connection-pool retry for transient network hiccups (no custom reconnection logic).

## `/health` behavior

`GET /health` returns:
- `200 OK` `{ ok: true, dbReachable: true, cluster: "<host>", db: "session_logs" }` when DB is reachable.
- `503 Service Unavailable` `{ ok: false, dbReachable: false, error: "<message>" }` when not.

**Behavior change to flag:** `serverManager.waitForReady()` currently treats any 2xx as "server ready". With this change, a server that binds but can't reach Atlas will fail `waitForReady` and the extension will refuse to start with `Server failed to start within 30s`. This is intentional — fail-loud over silent persistence loss. Document this in the troubleshooting section of the README.

## Verification plan

Step-by-step, run *in order* after implementation. Each step has a pass criterion.

**Step 1 — Cluster/DB visibility.**
Run extension. Open "Server Manager" output channel. Look for:
```
Connected to cluster: cluster0.fp3ny34.mongodb.net
Database: session_logs
Collections: projectConfigs, sessionLogs, chatMessages
```
Open Atlas dashboard. Confirm you're viewing the same cluster. Click Browse Collections, confirm `session_logs` DB exists with those three collections. **Pass criterion:** cluster URL in output matches the one in your Atlas browser address bar.

**Step 2 — Write smoke test.**
- Run `helloCigen.start`. Complete the host wizard. Atlas: `session_logs.sessionLogs` shows a new doc with matching `session_id`. **Pass:** doc visible within 5s of wizard completion.
- Send a chat message in the session. Atlas: `session_logs.chatMessages` shows a doc with matching `content`. **Pass:** doc visible within 3s.
- Type `/redistribute add a unit test` in chat. Atlas: session doc has a `pending_proposal` field. **Pass:** field visible after the proposal is posted to chat.

**Step 3 — Failure-mode verification.**
- Disconnect WiFi. Toggle a task in Task Tracker. **Pass:** `vscode.window.showWarningMessage` appears: "Task tracker failed to sync to server: ...". (Previously silent.)
- Curl `http://localhost:4000/health`. **Pass:** `503` with `dbReachable: false`. (Previously lied as 200.)
- Reconnect WiFi. Curl `/health` again. **Pass:** `200` with `dbReachable: true`.

**Step 4 — VSIX bake verification.**
- `MONGO_URI=<test-uri> npm run build`. **Pass:** `.vsix` is produced.
- `unzip -l hello-cigen-*.vsix | grep db.js`. **Pass:** `extension/out/server/db.js` is listed.
- `unzip -p hello-cigen-*.vsix extension/out/server/db.js | grep -o 'mongodb+srv://[^"]*'`. **Pass:** prints the URI. (Confirms `gen-config` baked it in.)
- Install the `.vsix` in a fresh VS Code workspace folder that has no `.env`. Run `helloCigen.start`. **Pass:** extension connects to Atlas and writes a session doc — proves end users need zero local config.

## Open risks

- **Anan was not consulted on reversing the Data API choice.** If he picked Atlas Data API for a reason not visible in the diff (course requirement, organizational policy against shipping DB drivers, etc.), this design contradicts that. Mention to him during code review. Treat as a blocker for merge if he raises a concrete reason.
- **Atlas IAM setup is manual.** Not automatable; user must do the 6-step console procedure above before the new URI is usable. Implementation plan should sequence this *before* code changes that depend on the new URI, so testing isn't blocked.
- **Existing cluster data.** The `session_logs` DB may have leftover docs from Anan's earlier Data API attempts or from local stash testing. Implementation plan should include a "browse Atlas, decide whether to wipe/keep" checkpoint before running the new smoke tests, so test results aren't confused with stale data.
- **`waitForReady` behavior change.** Extension now refuses to start if Atlas is unreachable. Acceptable per design decision (fail-loud), but flag in README troubleshooting so users with flaky WiFi understand the symptom.
- **No automated tests.** This project has no test suite. Verification is entirely manual per Step 1–4 above. Out of scope to add a test suite as part of this change.

## Action items (must be resolved before implementation)

- **Where does the canonical URI live for new contributors?** Pin in team Discord, private gist, class wiki, 1Password vault — pick one. The error message in `gen-config.js` will reference this location verbatim, so it must be decided first.
- **Atlas IAM user must be created in Atlas console** (the 6-step procedure above) and the new URI documented in the source picked above, before any of the code changes are tested. Implementation plan should sequence this as Step 1.
- **Audit existing `session_logs` data in Atlas.** Browse the collections, decide whether to wipe (clean slate for verification) or keep (preserve any real session history). Verification Step 1 results depend on knowing what existing docs to expect.

## What stays out of scope

- Refactoring `serverManager.ts` (forked-child architecture is preserved).
- Migrating to a hosted relay (revisit if credential-rotation cadence ever becomes a recurring concern).
- Hardening other `.catch(() => {})` patterns beyond the two specifically listed — those two are on the persistence path; others (UI polling, etc.) are unrelated.
- Adding a credential-rotation playbook beyond "rotate password in Atlas → rebuild + reship VSIX".
