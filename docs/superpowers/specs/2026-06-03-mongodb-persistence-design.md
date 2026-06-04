# MongoDB Persistence — Design Spec

**Date:** 2026-06-03
**Branch:** `action-items-to-mongodb-fix`
**Supersedes:** commit `d3a9984` ("switch MongoDB persistence to Atlas Data API")
**Revision history:** v2 (2026-06-03) — pivoted from build-time URI baking to VS Code secrets after discovering host-only Mongo access via Live Share `shareServer`.

## Problem

HelloCigen's MongoDB persistence is broken end-to-end. `src/utils/config.ts` ships placeholder strings (`YOUR_APP_ID_HERE`, `YOUR_API_KEY_HERE`), so every Atlas Data API call returns 404. Reads visibly fail (`GET /sessions` returns 500); writes silently fail because call sites like `taskTrackerProvider._persistDivisions` swallow errors with `try { ... } catch { /* Non-critical */ }`. The result: in-memory UI state diverges from MongoDB with no user-visible indication.

The Atlas Data API itself is officially deprecated; MongoDB's own migration guide recommends an Express + native-driver replacement. Filling in real credentials for `d3a9984` would buy at most a few months before the endpoint is fully retired.

A temporary stopgap (native driver imported from git-ignored `config.local.ts`) lives in `stash@{0}` and was used to test the redistribute feature, but it doesn't satisfy the "any contributor can clone and run" constraint.

## Constraints (non-negotiable)

- Reads/writes go to a shared MongoDB Atlas cluster (`cluster0.fp3ny34.mongodb.net`, DB `session_logs`).
- No secrets committed to git. No URIs, API keys, or app IDs in tracked files.
- "Each dev pastes credentials into a local file by hand" is not the solution. Onboarding must scale.
- Distribution model: contributors build from source during dev; end users install a prebuilt `.vsix`.

## Key architectural finding

**Only the host machine connects to MongoDB.** `src/ui/sessionDashboard.ts:911` calls `liveShare.shareServer({ port: 4000 })`, and lines 937–945 explicitly forbid guests from starting a local server. Guest `fetch('http://localhost:4000/...')` calls are tunneled by Live Share to the host's Express server. The host's local server is the single point of contact with Atlas.

Implication: the credential-delivery problem is *per-host*, not *per-participant*. Only one machine in a Live Share session needs the MongoDB URI.

## Decision

**Native MongoDB driver + URI delivered via VS Code secret storage, identical pattern to the existing OpenAI API key.**

The URI is entered once per host machine via a new `helloCigen.setMongoUri` command and stored in `context.secrets`. `serverManager.startServer()` reads it from secret storage and forwards it to the forked child process via `POST /mongo-uri` (mirroring the existing `POST /api-key` at `server.ts:706`). The server holds the URI in memory and lazy-connects on first DB call.

**Why this over build-time baking:**
- Same UX as existing API key (host already does paste-once for OpenAI). No new mental model.
- URI never leaves the OS keychain on the host's machine; never in source, never in `.env`, never in the shipped VSIX.
- Trivial credential rotation: host runs `setMongoUri` again. No rebuild, no reshipping.
- Less code to maintain: no build-pipeline changes, no `gen-config.js`, no `.gitignore` additions, no `dotenv` dep.
- Distribution-safe: the VSIX is "clean" — could be published anywhere.

**Trust model:** the URI lives in the host's OS keychain. If the host's laptop is fully compromised, attacker can extract the URI and run operations as `hellocigen-app`. Atlas IAM bounds the blast radius — see "IAM setup" below.

## Architecture

```
host VS Code
   ├─ context.secrets.get('mongodb-uri')  ← entered once via helloCigen.setMongoUri
   │
   ├─ serverManager.startServer()
   │     └─ POST http://localhost:4000/mongo-uri  { uri }
   │
   └─ Express server (forked child)
        ├─ stores uri in memory
        ├─ on first DB call → MongoClient.connect(uri)
        └─ liveShare.shareServer({ port: 4000 })  ← guests tunnel here

guest VS Code
   └─ fetch('http://localhost:4000/...') → tunneled by Live Share → host's server
       (no MongoDB credentials on guest machines, ever)
```

The forked-child Express server architecture is preserved. All HTTP routes, UI/webview code, and the SSE chat stream are unchanged. Only the persistence layer underneath, plus a tiny new credential endpoint, is added.

## Credential delivery mechanism

**New commands (`src/extension.ts`):**

- `helloCigen.setMongoUri` — `vscode.window.showInputBox({ password: true, prompt: "MongoDB connection URI (mongodb+srv://...)" })` → `context.secrets.store('mongodb-uri', uri)`. Mirrors `setApiKey` at line 258–274.
- `helloCigen.clearMongoUri` — `context.secrets.delete('mongodb-uri')`. Mirrors `clearApiKey` at line 276–282.

**Pre-flight in `helloCigen.start` (`src/extension.ts` and `src/ui/sessionDashboard.ts`):**

After the existing API key pre-flight, add a parallel block:

```ts
let mongoUri = await context.secrets.get('mongodb-uri');
if (!mongoUri) {
  const action = await vscode.window.showWarningMessage(
    "MongoDB URI not set. Session persistence won't work.",
    "Set MongoDB URI"
  );
  if (action === "Set MongoDB URI") {
    await vscode.commands.executeCommand("helloCigen.setMongoUri");
    mongoUri = await context.secrets.get('mongodb-uri');
  }
}
```

If the host declines, the session does not start (unlike the API key, where AI features degrade gracefully — MongoDB is core to session logging).

**Forward to server (mirror of API key flow at `extension.ts:158`):**

```ts
if (mongoUri) {
  await serverManager.httpFetch('/mongo-uri', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uri: mongoUri })
  });
}
```

This must run *before* the first `serverManager.httpFetch('/project_details')` call so the server has the URI when it needs it.

**New `/mongo-uri` endpoint (`src/server/server.ts`, mirror of `/api-key` at line 706):**

```ts
let mongoUri: string | undefined;
export function getMongoUri() { return mongoUri; }

app.post('/mongo-uri', (req, res) => {
  const { uri } = req.body as { uri: string };
  if (!uri) return res.status(400).json({ ok: false, error: 'uri is required' });
  mongoUri = uri;
  res.json({ ok: true });
});
```

`db.ts` calls `getMongoUri()` (or imports `mongoUri` directly) lazily, on first DB operation. If unset when a DB call is attempted, the call throws a clear error: `MongoDB URI not configured — call POST /mongo-uri first`.

## IAM setup (manual, one-time, in Atlas console)

Custom role tightly scoped to find/insert/update only (no delete, no drop):

1. **Atlas → Database Access → Custom Roles → Add New Custom Role.**
2. Name: `hellocigen-app-role`. Database: `session_logs`. Collection: leave blank (all collections in this DB).
3. Privileges (check exactly these, nothing else): `find`, `insert`, `update`.
4. Save the custom role.
5. **Database Access → Add New Database User.**
6. Username: `hellocigen-app`. Authentication method: password (generate long random).
7. Database User Privileges → Custom Roles → select `hellocigen-app-role`.
8. **Network Access → Add IP Address → Allow Access From Anywhere (`0.0.0.0/0`).** This is required because hosts connect from anywhere. The narrow custom role bounds the risk.
9. Construct URI: `mongodb+srv://hellocigen-app:<password>@cluster0.fp3ny34.mongodb.net/session_logs?retryWrites=true&w=majority`.
10. This URI is what hosts paste into `setMongoUri`.

**What this allows:** find documents, insert documents, update documents (including `$set`, `$unset`, `$inc` — `server.ts` uses `$set` and `$unset`, both covered by the `update` privilege).

**What this prevents:** delete documents, drop collections, drop databases, see other databases, manage users, change cluster settings. Worst case if URI leaks: attacker writes garbage docs into the three collections. Recovery: `updateMany({}, {...})` from the Atlas shell to overwrite, or just live with the noise — no permanent data loss is possible via this credential.

## File changes

| File | Action |
|------|--------|
| `src/server/db.ts` | Rewrite to native `mongodb` driver. Apply `stash@{0}` as starting point with the adjustments below. |
| `src/utils/config.ts` | **Delete.** Source of the `YOUR_APP_ID_HERE` bug. |
| `src/utils/config.local.ts` | **Delete.** No longer needed. |
| `src/server/server.ts` | Add `/mongo-uri` endpoint. `/health` probes MongoDB via `pingDb()`. Log connection target on first connect. Close MongoClient on shutdown. |
| `src/extension.ts` | Add `setMongoUri`/`clearMongoUri` commands. Add MongoDB URI pre-flight in `helloCigen.start`. Forward URI to server via `POST /mongo-uri`. Replace the silent `.catch(() => {})` on line 163 with a logging variant. |
| `src/ui/sessionDashboard.ts` | Add same MongoDB URI pre-flight and forwarding in the `createSession` flow around line 870–917. |
| `src/ui/taskTrackerProvider.ts` line 206–219 | Check `resp.ok` in `_persistDivisions`; surface failures via `vscode.window.showWarningMessage`. |
| `src/ui/taskTrackerProvider.ts` line 201–203 | `_triggerCodeReview` catch → log to output channel (genuinely non-critical). |
| `package.json` | `"commands"` section adds `helloCigen.setMongoUri` and `helloCigen.clearMongoUri`. No dep changes. |

### Adjustments to the stashed `db.ts`

- Replace `import { MONGO_URI } from '../utils/config.local'` with a function that retrieves the URI from the server-side variable set by `POST /mongo-uri` (small import path TBD during implementation — likely a `setMongoUri(uri)` function exported from `db.ts` itself, called by the `/mongo-uri` handler).
- Move the `MongoClient` construction inside `getDb()` so it can only run after the URI is set.
- Add exported `pingDb()` running `db.command({ ping: 1 })`. Returns `boolean`.
- Add exported `closeDb()` calling `client.close()`. Called from `server.ts` shutdown handlers.
- Reset the cached `dbPromise` on connection failure so a transient first-connect failure doesn't brick the server forever.
- Keep the `{$oid: hex}` normalize/denormalize helpers as-is — `server.ts` chat-cursor code (line 932, 947) depends on this contract.
- Comment in `db.ts` noting we rely on the driver's built-in connection-pool retry for transient network hiccups (no custom reconnection logic).

## `/health` behavior

`GET /health` returns:
- `200 OK` `{ ok: true, dbReachable: true, cluster: "<host>", db: "session_logs" }` when DB is reachable.
- `503 Service Unavailable` `{ ok: false, dbReachable: false, error: "<message>" }` when not (including when URI is not yet set — `dbReachable: false, error: "URI not configured"`).

**Behavior change to flag:** `serverManager.waitForReady()` currently treats any 2xx as "server ready". With this change, a server that binds but can't reach Atlas will fail `waitForReady` and the extension will refuse to start with `Server failed to start within 30s`. This is intentional — fail-loud over silent persistence loss.

**Ordering note:** `serverManager.startServer()` currently calls `waitForReady()` before `POST /mongo-uri` is sent. After this change, `/health` will return 503 (URI not configured) during that initial poll, and the extension will fail to start. Fix: send the URI to the server *as part of* `startServer()` (before `waitForReady()` polls), or change `waitForReady()` to treat 503-with-`URI not configured` as "still booting, retry" but 503-with-any-other-error as fatal. The cleaner fix is to send the URI inline during startup; spec defers exact ordering to the implementation plan.

## Verification plan

Step-by-step, run *in order* after implementation. Each step has a pass criterion.

**Pre-step — note existing data.**
Before any new code runs against the cluster: open Atlas → `session_logs` → record current document counts for `projectConfigs`, `sessionLogs`, `chatMessages`. After verification, new docs added by Step 2 should equal the delta. (Per user decision: keep existing data, don't wipe.)

**Step 1 — Cluster/DB visibility.**
Run extension as host. Open "Server Manager" output channel. After `setMongoUri` + session start, look for:
```
Connected to cluster: cluster0.fp3ny34.mongodb.net
Database: session_logs
Collections: projectConfigs, sessionLogs, chatMessages
```
Open Atlas dashboard. Confirm you're viewing the same cluster. Browse Collections, confirm `session_logs` DB exists with those three collections. **Pass:** cluster URL in output matches the URL in your Atlas browser address bar.

**Step 2 — Write smoke test.**
- Run `helloCigen.start`. Complete the host wizard. Atlas: `session_logs.sessionLogs` shows one new doc with matching `session_id`. **Pass:** doc visible within 5s of wizard completion, count = pre-step count + 1.
- Send a chat message in the session. Atlas: `session_logs.chatMessages` shows one new doc with matching `content`. **Pass:** doc visible within 3s.
- Type `/redistribute add a unit test` in chat. Atlas: session doc has a `pending_proposal` field. **Pass:** field visible after the proposal is posted to chat.

**Step 3 — Failure-mode verification.**
- Disconnect WiFi. Toggle a task in Task Tracker. **Pass:** `vscode.window.showWarningMessage` appears: "Task tracker failed to sync to server: ...". (Previously silent.)
- Curl `http://localhost:4000/health`. **Pass:** `503` with `dbReachable: false`. (Previously lied as 200.)
- Reconnect WiFi. Curl `/health` again. **Pass:** `200` with `dbReachable: true`.

**Step 4 — Custom-role enforcement.**
- From Atlas shell or Compass connected with `hellocigen-app` URI: attempt `db.sessionLogs.deleteOne({})`. **Pass:** Atlas rejects with permission error (`not authorized on session_logs to execute command`).
- From same connection: attempt `db.adminCommand({ listDatabases: 1 })`. **Pass:** rejected or returns only `session_logs`.

**Step 5 — Distribution test (VSIX cleanliness).**
- Run `npm run compile && npx @vscode/vsce package`. **Pass:** `.vsix` produced.
- `unzip -p hello-cigen-*.vsix extension/out/server/db.js | grep -c 'mongodb+srv'`. **Pass:** `0` (no URI baked into shipped artifact).
- Install the `.vsix` in a fresh VS Code workspace. Run `helloCigen.start` without setting the URI first. **Pass:** prompt appears asking to set the URI. Set it. Session proceeds normally.

## Open risks

- **Atlas IAM setup is manual.** Not automatable; you must do the 10-step console procedure above before any code changes can be tested. Implementation plan sequences this as Step 1.
- **Existing cluster data.** Decision per user: keep existing data, just note current doc counts as the verification baseline. No cleanup step needed.
- **`waitForReady` ordering.** The cleanest fix to the "URI not yet set when health probe runs" ordering issue is to send the URI inline during `startServer()`. Implementation plan must address this carefully — getting this wrong manifests as "extension hangs on startup".
- **Two pre-flight call sites.** Both `extension.ts:helloCigen.start` and `sessionDashboard.ts:createSession` start the server and forward credentials. The MongoDB URI flow needs to be added to *both*, in the same order as the existing API key flow. Easy to miss one.
- **No automated tests.** This project has no test suite. Verification is entirely manual per Step 1–5 above. Out of scope to add a test suite as part of this change.

## What stays out of scope

- Refactoring `serverManager.ts` (forked-child architecture is preserved).
- Migrating to a hosted relay (revisit if you ever want guest-side persistence or shared state across non-Live-Share sessions).
- Hardening other `.catch(() => {})` patterns beyond the two specifically listed — those two are on the persistence path; others (UI polling, etc.) are unrelated to this fix.
- Migrating the OpenAI API key flow itself (it already works).
